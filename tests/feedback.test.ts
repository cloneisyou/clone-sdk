import { describe, expect, it, vi } from 'vitest';
import { createEventTransport, FeedbackTracker } from '../src/feedback.js';
import type { FeedbackEvent } from '../src/feedback.js';

describe('feedback attribution and collection', () => {
  it.each([
    { value: 'x'.repeat(4001), collected: false },
    { value: '😀'.repeat(4000), collected: true },
  ])('records edited submission when optional text collection is $collected', async ({ value, collected }) => {
    const events: FeedbackEvent[] = [];
    const receipts = vi.fn();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
      const event = JSON.parse(String(options?.body)) as FeedbackEvent;
      events.push(event);
      return event.final_text && Array.from(event.final_text).length > 4000
        ? Response.json({ detail: { code: 'validation_error' } }, { status: 422 })
        : Response.json({ status: 'recorded' });
    });
    const tracker = new FeedbackTracker(createEventTransport('/events', { fetch: fetcher }), {
      collectSubmittedText: true, onDelivery: receipts,
    });
    tracker.observe({ request_id: 'p1', kind: 'accepted' }, 'draft');
    tracker.input('draft suggestion'); tracker.input(value); tracker.submitted(value);
    await vi.waitFor(() => expect(receipts).toHaveBeenCalledTimes(3));
    const submitted = events.find(event => event.kind === 'submitted');
    expect(submitted).toMatchObject({ submission_origin: 'edited_prediction' });
    expect(submitted?.final_text).toBe(collected ? value : undefined);
    expect(receipts.mock.calls.every(([receipt]) => receipt.status === 'recorded')).toBe(true);
  });
  it('collects edited sent text only after explicit opt-in and preserves its origin', () => {
    const events: FeedbackEvent[] = [];
    const tracker = new FeedbackTracker(event => events.push(event), { collectSubmittedText: true });
    tracker.observe({ request_id: 'p1', kind: 'accepted' }, 'draft');
    tracker.input('draft suggestion'); tracker.input('draft corrected');
    expect(events.map(event => event.kind)).toEqual(['accepted', 'edited']);
    expect(tracker.submitted('draft corrected')).toBe('edited_prediction');
    expect(events.at(-1)).toMatchObject({ kind: 'submitted', final_text: 'draft corrected', content_opt_in: true,
      submission_origin: 'edited_prediction' });
    expect(tracker.submitted('unrelated')).toBe('human');
  });
  it('does not collect unchanged generated text as independently human-written evidence', () => {
    const events: FeedbackEvent[] = [];
    const tracker = new FeedbackTracker(event => events.push(event), { collectSubmittedText: true });
    tracker.observe({ request_id: 'p1', kind: 'accepted' }, ''); tracker.input('generated'); tracker.submitted('generated');
    expect(events.at(-1)).toMatchObject({ submission_origin: 'accepted_prediction' });
    expect(events.at(-1)).not.toHaveProperty('final_text');
  });
  it('keeps dismiss, explicit rejection, evaluation and observed task outcome distinct', () => {
    const events: FeedbackEvent[] = [];
    const tracker = new FeedbackTracker(event => events.push(event));
    tracker.observe({ request_id: 'p1', kind: 'dismissed' }, '');
    tracker.rejected('p1', { reason: 'too_long' });
    tracker.feedback('p1', { rating: 'negative', guidance: 'Be concise', content_opt_in: true });
    tracker.outcome('p1', 'failed');
    expect(events.map(event => event.kind)).toEqual(['dismissed', 'rejected', 'feedback', 'outcome']);
    expect(() => tracker.feedback('p1', { guidance: 'private' })).toThrow('content_opt_in');
    expect(events).toHaveLength(4);
  });
  it('cancels old scope and isolates rejected asynchronous observers from typing', async () => {
    const signals: AbortSignal[] = [];
    const delivery = vi.fn();
    const tracker = new FeedbackTracker((_event, { signal }) => {
      signals.push(signal); return Promise.reject(new Error('offline'));
    }, { onDelivery: receipt => { delivery(receipt); return Promise.reject(new Error('observer')); } });
    tracker.observe({ request_id: 'p1', kind: 'accepted' }, 'draft'); tracker.reset();
    tracker.input('unrelated'); expect(tracker.submitted('unrelated')).toBe('human');
    tracker.feedback('p2', { rating: 'positive' });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(signals.map(signal => signal.aborted)).toEqual([true, false]);
    expect(delivery.mock.calls.map(([receipt]) => receipt.status)).toEqual(['cancelled', 'failed']);
  });
});

describe('bounded idempotent event delivery', () => {
  const event: FeedbackEvent = { event_id: 'e1', request_id: 'p1', kind: 'accepted' };
  it('retries transient errors with the exact same body and stops after acknowledgement', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(Response.json({ detail: { code: 'busy' } }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ status: 'recorded' }));
    await createEventTransport('/events', { fetch: fetcher })(event, { signal: new AbortController().signal });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(new Set(fetcher.mock.calls.map(([, options]) => options?.body)).size).toBe(1);
    expect(fetcher.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Authorization');
  });
  it.each([401, 409, 422])('does not retry terminal HTTP %s', async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ detail: { code: 'terminal' } }, { status }));
    await expect(createEventTransport('/events', { fetch: fetcher })(event, { signal: new AbortController().signal }))
      .rejects.toMatchObject({ status });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('bounds hung body reads, rejects saturation and frees capacity', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(new ReadableStream({ start() {} })));
    const transport = createEventTransport('/events', { fetch: fetcher, requestTimeoutMs: 5, maxConcurrentRequests: 1 });
    const pending = transport(event, { signal: new AbortController().signal }).catch(error => error);
    await expect(transport(event, { signal: new AbortController().signal })).rejects.toMatchObject({ code: 'event_capacity_exceeded' });
    expect(await pending).toMatchObject({ code: 'prediction_timeout' });
    expect(fetcher).toHaveBeenCalledTimes(3);
    fetcher.mockResolvedValueOnce(Response.json({ status: 'recorded' }));
    await transport(event, { signal: new AbortController().signal });
  });
  it('cancellation prevents retry and a malformed acknowledgement is not success', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
    const stop = new AbortController();
    const pending = createEventTransport('/events', { fetch: fetcher })(event, { signal: stop.signal });
    stop.abort();
    await expect(pending).rejects.toMatchObject({ status: 499 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockResolvedValueOnce(Response.json({ status: 'unconfirmed' }));
    await expect(createEventTransport('/events', { fetch: fetcher })(event, { signal: new AbortController().signal }))
      .rejects.toMatchObject({ code: 'invalid_event_response' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

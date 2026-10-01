import { describe, expect, it, vi } from 'vitest';
import { ClonePredictionError, createPredictionTransport } from '../src/transport.js';
import { readResponse } from '../src/http.js';
import type { CompletionRequest } from '../src/types.js';

describe('HTTP response boundary', () => {
  it('reports safe timing through body completion and tolerates a broken observer', async () => {
    const metrics: unknown[] = [];
    const input = { request_id: 'private-request', draft: { text: 'private draft' } } as CompletionRequest;
    const transport = createPredictionTransport('/api/predict', {
      fetch: vi.fn().mockResolvedValue(Response.json({ status: 'suggested', completion: 'private output' })),
      onMetric: metric => { metrics.push(metric); throw new Error('observer unavailable'); },
    });
    await expect(transport(input, { signal: new AbortController().signal })).resolves.toMatchObject({ status: 'suggested' });
    expect(metrics).toEqual([{ durationMs: expect.any(Number), status: 200, outcome: 'suggested' }]);
    expect(JSON.stringify(metrics)).not.toContain('private');
  });

  it('measures a failed body read and cancellation without swallowing the original error', async () => {
    const metrics = vi.fn();
    const abort = new AbortController();
    const error = new DOMException('private error details', 'AbortError');
    const transport = createPredictionTransport('/api/predict', {
      fetch: vi.fn().mockRejectedValue(error), onMetric: metrics,
    });
    await expect(transport({} as CompletionRequest, { signal: abort.signal })).rejects.toBe(error);
    expect(metrics).toHaveBeenCalledWith({ durationMs: expect.any(Number), status: 0, outcome: 'cancelled', code: 'cancelled' });
  });
  it('isolates asynchronous observer failures without awaiting diagnostics', async () => {
    const transport = createPredictionTransport('/api/predict', {
      fetch: vi.fn().mockResolvedValue(Response.json({ status: 'suggested', completion: 'example' })),
      onMetric: async () => { throw new Error('diagnostics unavailable'); },
    });
    await expect(transport({} as CompletionRequest, { signal: new AbortController().signal }))
      .resolves.toMatchObject({ status: 'suggested' });
  });
  it('counts deadline expiry as a failure rather than user cancellation', async () => {
    const metrics = vi.fn();
    const abort = new AbortController();
    abort.abort(new DOMException('Private details', 'TimeoutError'));
    const transport = createPredictionTransport('/api/predict', {
      fetch: vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')), onMetric: metrics,
    });
    await expect(transport({} as CompletionRequest, { signal: abort.signal })).rejects.toBeInstanceOf(DOMException);
    expect(metrics).toHaveBeenCalledWith({ durationMs: expect.any(Number), status: 0, outcome: 'failed', code: 'prediction_timeout' });
  });
  it('reports an invalid success envelope as a failure', async () => {
    const metrics = vi.fn();
    const transport = createPredictionTransport('/api/predict', {
      fetch: vi.fn().mockResolvedValue(Response.json({ private: 'invalid response' })), onMetric: metrics,
    });
    await expect(transport({} as CompletionRequest, { signal: new AbortController().signal })).rejects.toMatchObject({ code: 'invalid_response' });
    expect(metrics).toHaveBeenCalledWith({ durationMs: expect.any(Number), status: 200, outcome: 'failed', code: 'invalid_response' });
  });
  it.each(['null', '[]', '"text"', '', '<html>upstream unavailable</html>'])(
    'rejects a successful non-object response: %s', async body => {
      await expect(readResponse(new Response(body))).rejects.toMatchObject({
        name: 'ClonePredictionError', code: 'invalid_response', status: 502,
      });
    },
  );

  it.each([402, 409, 429, 503])('preserves service code and HTTP status %i', async status => {
    await expect(readResponse(Response.json({ detail: { code: 'rate_limited' } }, { status })))
      .rejects.toMatchObject({ code: 'rate_limited', status });
  });

  it.each([
    '<html>private upstream detail</html>',
    JSON.stringify({ detail: [{ msg: 'validation error' }] }),
    JSON.stringify({ detail: { code: 'private upstream detail' } }),
    'null',
  ])('does not expose unstructured upstream details', async body => {
    await expect(readResponse(new Response(body, { status: 502 }))).rejects.toEqual(
      new ClonePredictionError('prediction_request_failed', 502),
    );
  });

  it('preserves cancellation while the response body is being read', async () => {
    const error = new DOMException('Aborted', 'AbortError');
    const response = new Response(new ReadableStream({ start(controller) { controller.error(error); } }));
    await expect(readResponse(response)).rejects.toBe(error);
  });

  it('forwards headers, same-origin credentials and the caller signal without retry', async () => {
    const request: CompletionRequest = {
      session_id: 'thread', context_revision: '1', request_id: 'request',
      mode: 'complete_draft', draft: { text: 'draft', revision: 1 },
    };
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json({ detail: { code: 'rate_limited' } }, { status: 429 }),
    );
    const signal = new AbortController().signal;
    const transport = createPredictionTransport('/api/predict', { fetch, headers: () => ({ 'X-CSRF': 'fixture' }) });
    await expect(transport(request, { signal })).rejects.toMatchObject({ status: 429 });
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/predict', {
      method: 'POST', credentials: 'same-origin', signal,
      headers: { 'Content-Type': 'application/json', 'X-CSRF': 'fixture' }, body: JSON.stringify(request),
    });
  });
});

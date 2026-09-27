import { describe, expect, it, vi } from 'vitest';
import { ClonePredictionError, createPredictionTransport } from '../src/transport.js';
import { readResponse } from '../src/http.js';
import type { CompletionRequest } from '../src/types.js';

describe('HTTP response boundary', () => {
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

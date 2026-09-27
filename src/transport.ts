import type { PredictionOutput, PredictionTransport } from './types.js';
import { readResponse } from './http.js';
export { ClonePredictionError } from './http.js';

/** Call your own authenticated backend. Never put a Clone app key in a browser. */
export function createPredictionTransport(endpoint: string, options: {
  fetch?: typeof fetch;
  headers?: () => Record<string, string>;
} = {}): PredictionTransport {
  const request = options.fetch ?? globalThis.fetch;
  return async (input, { signal }) => {
    const response = await request(endpoint, {
      method: 'POST', credentials: 'same-origin', signal,
      headers: { 'Content-Type': 'application/json', ...options.headers?.() },
      body: JSON.stringify(input),
    });
    return await readResponse(response) as PredictionOutput;
  };
}

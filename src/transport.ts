import type { PredictionOutput, PredictionTransport } from './types.js';
import { readResponse } from './http.js';
import { ClonePredictionError } from './http.js';
export { ClonePredictionError } from './http.js';

/** Host-owned diagnostics. Contains no text, user identifiers or credentials. */
export interface PredictionMetric {
  durationMs: number;
  status: number;
  outcome: 'suggested' | 'abstained' | 'failed' | 'cancelled';
  code?: string;
}

/** Call your own authenticated backend. Never put a Clone app key in a browser. */
export function createPredictionTransport(endpoint: string, options: {
  fetch?: typeof fetch;
  headers?: () => Record<string, string>;
  onMetric?: (metric: PredictionMetric) => void;
} = {}): PredictionTransport {
  const request = options.fetch ?? globalThis.fetch;
  return async (input, { signal }) => {
    const started = performance.now();
    let status = 0;
    let outcome: PredictionMetric['outcome'] = 'failed';
    let code: string | undefined;
    try {
      const response = await request(endpoint, {
        method: 'POST', credentials: 'same-origin', signal,
        headers: { 'Content-Type': 'application/json', ...options.headers?.() },
        body: JSON.stringify(input),
      });
      status = response.status;
      const output = await readResponse(response) as PredictionOutput;
      if (output.status !== 'suggested' && output.status !== 'abstained') throw new ClonePredictionError('invalid_response', 502);
      outcome = output.status === 'abstained' ? 'abstained' : 'suggested';
      return output;
    } catch (error) {
      const timedOut = signal.aborted && (signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError'
        || signal.reason instanceof ClonePredictionError && signal.reason.code === 'prediction_timeout');
      if (!timedOut && (signal.aborted || error instanceof DOMException && error.name === 'AbortError')) outcome = 'cancelled';
      code = timedOut ? 'prediction_timeout' : error instanceof ClonePredictionError ? error.code
        : outcome === 'cancelled' ? 'cancelled' : 'network_error';
      throw error;
    } finally {
      try { options.onMetric?.({ durationMs: Math.max(0, performance.now() - started), status, outcome, ...(code ? { code } : {}) }); }
      catch { /* Diagnostics never interfere with prediction, input or send. */ }
    }
  };
}

import type { PredictionEvent } from './types.js';
import { ClonePredictionError, readResponse } from './http.js';
import { withDeadline } from './deadline.js';

export type FeedbackEvent = Omit<PredictionEvent, 'user_id'>;
export type EventTransport = (event: FeedbackEvent, options: { signal: AbortSignal }) => Promise<void>;
type Observation = { request_id: string; kind: 'presented' | 'accepted' | 'dismissed' };
export type FeedbackEvaluation = Pick<FeedbackEvent, 'rating' | 'reason' | 'guidance' | 'content_opt_in'>;
export type FeedbackReceipt = { event_id: string; request_id: string; kind: FeedbackEvent['kind'];
  observed_at: number; status: 'recorded' | 'failed' | 'cancelled' };

/** Browser -> authenticated host proxy. No app key belongs in this transport. */
export function createEventTransport(url: string, options: {
  fetch?: typeof fetch; requestTimeoutMs?: number; maxConcurrentRequests?: number;
} = {}): EventTransport {
  const fetcher = options.fetch ?? globalThis.fetch;
  const timeout = options.requestTimeoutMs ?? 2000;
  const limit = options.maxConcurrentRequests ?? 4;
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 30_000 || !Number.isInteger(limit) || limit < 1 || limit > 32) {
    throw new Error('Invalid feedback transport limits');
  }
  let inFlight = 0;
  return async (event, { signal }) => {
    if (inFlight >= limit) throw new ClonePredictionError('event_capacity_exceeded', 503);
    // Serialize once: every retry has exactly the same ID and body.
    const body = JSON.stringify(event);
    inFlight++;
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          await withDeadline(async boundedSignal => {
            const response = await fetcher(url, { method: 'POST', credentials: 'same-origin', signal: boundedSignal,
              headers: { 'Content-Type': 'application/json' }, body });
            const result = await readResponse(response) as { status?: unknown };
            if (result.status !== 'recorded') throw new ClonePredictionError('invalid_event_response', 502);
          }, timeout, signal);
          return;
        } catch (error) {
          const transient = error instanceof TypeError || error instanceof ClonePredictionError
            && (error.status === 429 || error.status >= 500) && !error.code.startsWith('invalid_');
          if (signal.aborted || !transient || attempt >= 2) throw error;
          await withDeadline(() => new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1))), 1000, signal);
        }
      }
    } finally { inFlight--; }
  };
}

/** Attribution is local. Text collection is off unless explicitly enabled. */
export class FeedbackTracker {
  private accepted: { requestId: string; before: string; inserted: string | null; edited: boolean } | null = null;
  private scope = new AbortController();
  constructor(private readonly deliver: (event: FeedbackEvent, options: { signal: AbortSignal }) => unknown,
    private readonly options: {
      collectSubmittedText?: boolean;
      onDelivery?: (receipt: FeedbackReceipt) => unknown;
    } = {}) {}

  private emit(request_id: string, kind: FeedbackEvent['kind'], values: Partial<FeedbackEvent> = {}) {
    const event: FeedbackEvent = { ...values, event_id: crypto.randomUUID(), request_id, kind };
    const signal = this.scope.signal;
    const observed_at = Date.now();
    const receipt = (status: 'recorded' | 'failed' | 'cancelled') => {
      try { void Promise.resolve(this.options.onDelivery?.({ event_id: event.event_id, request_id, kind, observed_at, status })).catch(() => {}); }
      catch { /* diagnostics never control typing */ }
    };
    try {
      void Promise.resolve(this.deliver(event, { signal })).then(() => receipt(signal.aborted ? 'cancelled' : 'recorded'),
        () => receipt(signal.aborted ? 'cancelled' : 'failed'));
    } catch { receipt(signal.aborted ? 'cancelled' : 'failed'); }
    return event.event_id;
  }

  observe(event: Observation, before: string) {
    if (event.kind === 'accepted') this.accepted = { requestId: event.request_id, before, inserted: null, edited: false };
    this.emit(event.request_id, event.kind);
  }
  input(value: string) {
    const accepted = this.accepted;
    if (!accepted) return;
    if (accepted.inserted === null) { accepted.inserted = value; return; }
    if (!value.trim() || value === accepted.before) { this.accepted = null; return; }
    if (value !== accepted.inserted && !accepted.edited) {
      accepted.edited = true;
      this.emit(accepted.requestId, 'edited');
    }
  }
  /** Call only AFTER the host successfully accepts the user's explicit send. */
  submitted(value: string): 'human' | 'accepted_prediction' | 'edited_prediction' {
    const accepted = this.accepted;
    this.accepted = null;
    if (!accepted || accepted.inserted === null || !value.trim() || value === accepted.before) return 'human';
    const origin = value === accepted.inserted ? 'accepted_prediction' : 'edited_prediction';
    this.emit(accepted.requestId, 'submitted', { submission_origin: origin,
      ...(origin === 'edited_prediction' && this.options.collectSubmittedText && Array.from(value).length <= 4000
        ? { final_text: value, content_opt_in: true } : {}) });
    return origin;
  }
  /** An explicit quality decision, separate from Escape, blur and expiry. */
  rejected(requestId: string, evaluation: FeedbackEvaluation = {}) { return this.evaluate(requestId, 'rejected', evaluation); }
  feedback(requestId: string, evaluation: FeedbackEvaluation) { return this.evaluate(requestId, 'feedback', evaluation); }
  private evaluate(requestId: string, kind: 'rejected' | 'feedback', evaluation: FeedbackEvaluation) {
    if (evaluation.guidance && !evaluation.content_opt_in) throw new Error('Feedback guidance requires content_opt_in');
    return this.emit(requestId, kind, evaluation);
  }
  /** Caller must observe the actual downstream task result; SDK does not infer it. */
  outcome(requestId: string, result: 'succeeded' | 'failed') { return this.emit(requestId, 'outcome', { outcome: result }); }
  /** Account/thread/connection changes cancel outstanding old-scope delivery. */
  reset() { this.accepted = null; this.scope.abort(); this.scope = new AbortController(); }
}

import type { CompletionRequest, PredictionOutput, PredictionTransport } from './types.js';
import { withDeadline } from './deadline.js';

export interface CloneModeInput {
  /** Bind to the authenticated host user and thread. Never reuse across users. */
  scopeId: string;
  context: Omit<CompletionRequest, 'draft' | 'mode' | 'request_id'>;
  draft: string;
  enabled: boolean;
  busy: boolean;
  composing?: boolean;
  visible?: boolean;
}
export interface CloneModeState {
  status: 'off' | 'predicting' | 'reviewing' | 'submitting' | 'waiting' | 'stopped';
  sent: number;
  maxTurns: number;
  candidate: PredictionOutput | null;
  sendAt: number | null;
  reason: string | null;
}
export interface CloneModeOptions {
  transport: PredictionTransport;
  /** Return true only after the host accepted the send. Unknown outcomes must not be retried. */
  onSubmit: (text: string, metadata: { requestId: string; origin: 'agent'; signal: AbortSignal }) => Promise<boolean>;
  reviewMs?: number;
  requestTimeoutMs?: number;
}

/** Explicit, bounded delegation. Normal Tab completion never starts this controller. */
export class CloneModeController {
  private input: CloneModeInput | null = null;
  private disposed = false;
  private scope = '';
  private epoch = 0;
  private abort = new AbortController();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private sessionTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingSubmission = false;
  private submittedRevision = '';
  private usedRequests = new Set<string>();
  private listeners = new Set<() => void>();
  private state: CloneModeState = { status: 'off', sent: 0, maxTurns: 3, candidate: null, sendAt: null, reason: null };

  constructor(private readonly options: CloneModeOptions) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit(change: Partial<CloneModeState>) {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }
  private identity(input: CloneModeInput) {
    return JSON.stringify([input.scopeId, input.context.session_id, input.context.connection_id ?? null]);
  }
  private eligible() {
    return this.input?.enabled && this.input.visible !== false && !this.input.draft && !this.input.composing;
  }
  update(input: CloneModeInput) {
    if (this.disposed) return;
    // Detach from host objects that may be mutated while a request is in flight.
    const next = structuredClone(input);
    const active = !['off', 'stopped'].includes(this.state.status);
    const contextChanged = this.input && JSON.stringify(this.input.context) !== JSON.stringify(next.context);
    this.input = next;
    if (!active) return;
    if (this.identity(next) !== this.scope) this.stop('scope_changed');
    else if (!this.eligible()) this.stop(next.draft || next.composing ? 'user_input' : 'unavailable');
    else if (['predicting', 'reviewing'].includes(this.state.status) && (contextChanged || next.busy)) this.stop('context_changed');
  }
  /** Call only from the end user's explicit Start action, never on mount or restore. */
  start({ maxTurns = 3, maxDurationMs = 300_000 }: { maxTurns?: number; maxDurationMs?: number } = {}) {
    if (this.disposed || !this.input || !this.eligible() || this.input.busy || this.pendingSubmission
      || !['off', 'stopped'].includes(this.state.status)) return false;
    if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 100
      || !Number.isFinite(maxDurationMs) || maxDurationMs < 1000 || maxDurationMs > 3_600_000) throw new Error('Invalid Clone mode limits');
    this.stop('restarted');
    this.abort = new AbortController();
    this.scope = this.identity(this.input);
    this.usedRequests.clear();
    const epoch = this.epoch;
    this.emit({ status: 'predicting', sent: 0, maxTurns, candidate: null, sendAt: null, reason: null });
    if (epoch !== this.epoch) return false;
    this.sessionTimer = setTimeout(() => this.stop('time_limit'), maxDurationMs);
    void this.predict();
    return true;
  }
  stop(reason = 'user_stopped') {
    this.epoch++;
    this.abort.abort();
    clearTimeout(this.timer); clearTimeout(this.sessionTimer);
    this.emit({ status: 'stopped', candidate: null, sendAt: null, reason });
  }
  /** Call after a real host turn finishes and its new context has been supplied via update(). */
  turnCompleted() {
    if (this.state.status !== 'waiting' || !this.input || this.input.busy || !this.eligible()
      || this.input.context.context_revision === this.submittedRevision) return false;
    if (this.state.sent >= this.state.maxTurns) { this.stop('turn_limit'); return false; }
    void this.predict();
    return true;
  }
  private async predict() {
    const input = this.input!;
    const epoch = this.epoch;
    const request: CompletionRequest = { ...input.context, connection_id: input.context.connection_id ?? null,
      request_id: crypto.randomUUID(), mode: 'next_prompt', draft: { text: '', revision: 0 } };
    this.emit({ status: 'predicting', candidate: null, sendAt: null });
    if (epoch !== this.epoch) return;
    try {
      const timeout = this.options.requestTimeoutMs ?? 15_000;
      const candidate = await withDeadline(signal => this.options.transport(request, { signal }),
        Number.isFinite(timeout) ? Math.max(1, Math.min(timeout, 30_000)) : 15_000, this.abort.signal);
      if (epoch !== this.epoch) return;
      if (!candidate || candidate.request_id !== request.request_id || candidate.session_id !== request.session_id
        || candidate.context_revision !== request.context_revision || candidate.connection_id !== request.connection_id
        || candidate.draft_revision !== 0 || !Number.isFinite(candidate.expires_at)) return this.stop('invalid_prediction');
      if (candidate.status === 'abstained') return this.stop('abstained');
      if (candidate.status !== 'suggested' || typeof candidate.completion !== 'string' || !candidate.completion.trim()) return this.stop('invalid_prediction');
      const delay = this.options.reviewMs ?? 2000;
      const reviewMs = Number.isFinite(delay) ? Math.max(1000, Math.min(delay, 10_000)) : 2000;
      const sendAt = Date.now() + reviewMs;
      if (candidate.expires_at * 1000 <= sendAt) return this.stop('expired');
      this.emit({ status: 'reviewing', candidate, sendAt });
      if (epoch === this.epoch) this.timer = setTimeout(() => void this.submit(candidate, epoch), reviewMs);
    } catch { if (epoch === this.epoch) this.stop('prediction_failed'); }
  }
  private async submit(candidate: PredictionOutput, epoch: number) {
    if (epoch !== this.epoch) return;
    if (!this.input || !this.eligible() || this.input.busy
      || candidate.expires_at * 1000 <= Date.now() || this.usedRequests.has(candidate.request_id)) return this.stop('not_ready');
    this.usedRequests.add(candidate.request_id);
    this.submittedRevision = this.input.context.context_revision;
    this.pendingSubmission = true;
    this.emit({ status: 'submitting', sendAt: null });
    try {
      if (epoch !== this.epoch) return;
      const accepted = await this.options.onSubmit(candidate.completion,
        { requestId: candidate.request_id, origin: 'agent', signal: this.abort.signal });
      if (epoch !== this.epoch) return;
      if (!accepted) return this.stop('send_rejected');
      const sent = this.state.sent + 1;
      this.emit({ status: 'waiting', sent, candidate: null });
      if (sent >= this.state.maxTurns) this.stop('turn_limit');
    } catch { if (epoch === this.epoch) this.stop('send_failed'); }
    finally { this.pendingSubmission = false; }
  }
  dispose() { this.disposed = true; this.stop('disposed'); this.listeners.clear(); }
}

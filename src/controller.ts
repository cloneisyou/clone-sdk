import type { CompletionRequest, PredictionOutput, PredictionTransport } from './types.js';

export interface CompletionInput {
  value: string;
  revision: number;
  context: Omit<CompletionRequest, 'draft' | 'mode' | 'request_id'>;
  focused: boolean;
  composing: boolean;
  selectionStart: number;
  selectionEnd: number;
  enabled?: boolean;
}

export interface CompletionState {
  status: 'idle' | 'loading' | 'suggested' | 'unavailable';
  candidate: PredictionOutput | null;
  error: string | null;
  /** Full in instant mode; a grapheme-safe prefix during optional animation. */
  visibleCompletion: string;
}

export interface AcceptedCompletion { value: string; suffix: string; requestId: string }

export interface CompletionOptions {
  transport: PredictionTransport;
  debounceMs?: number;
  maxRequestsPerMinute?: number;
  requestTimeoutMs?: number;
  presentation?: 'instant' | 'typewriter';
  onEvent?: (event: { request_id: string; kind: 'presented' | 'accepted' | 'dismissed' }) => void;
}

/** Prediction lifecycle only. It has no submit, agent, or execution API. */
export class CompletionController {
  private input: CompletionInput | null = null;
  private key = '';
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  private animation: ReturnType<typeof setTimeout> | undefined;
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private abort: AbortController | undefined;
  private listeners = new Set<() => void>();
  private requestTimes: number[] = [];
  private disposed = false;
  private state: CompletionState = { status: 'idle', candidate: null, error: null, visibleCompletion: '' };

  constructor(private readonly options: CompletionOptions) {}
  getSnapshot = (): CompletionState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit(state: Omit<CompletionState, 'visibleCompletion'> & { visibleCompletion?: string }) {
    this.state = { ...state, visibleCompletion: state.visibleCompletion ?? state.candidate?.completion ?? '' };
    for (const listener of this.listeners) listener();
  }

  private event(request_id: string, kind: 'presented' | 'accepted' | 'dismissed') {
    try { this.options.onEvent?.({ request_id, kind }); } catch { /* telemetry never controls typing */ }
  }

  private invalidate(reason?: unknown) {
    this.generation++;
    clearTimeout(this.timer);
    clearTimeout(this.expiry);
    clearTimeout(this.animation);
    clearTimeout(this.deadline);
    this.abort?.abort(reason);
    this.abort = undefined;
  }

  update(input: CompletionInput) {
    if (this.disposed) return;
    const nextKey = JSON.stringify(input);
    if (nextKey === this.key) return;
    this.key = nextKey;
    this.input = input;
    this.invalidate();
    this.emit({ status: 'idle', candidate: null, error: null });
    if (input.enabled === false || !input.focused || input.composing
      || input.selectionStart !== input.value.length || input.selectionEnd !== input.value.length) return;
    const generation = this.generation;
    this.timer = setTimeout(() => void this.predict(generation, input), this.options.debounceMs ?? 350);
  }

  private async predict(generation: number, input: CompletionInput) {
    this.requestTimes = this.requestTimes.filter(t => Date.now() - t < 60_000);
    if (this.requestTimes.length >= (this.options.maxRequestsPerMinute ?? 20)) return;
    this.requestTimes.push(Date.now());
    const abort = new AbortController();
    this.abort = abort;
    const request: CompletionRequest = {
      ...input.context, connection_id: input.context.connection_id ?? null, request_id: crypto.randomUUID(),
      mode: input.value ? 'complete_draft' : 'next_prompt', draft: { text: input.value, revision: input.revision },
    };
    this.emit({ status: 'loading', candidate: null, error: null });
    if (generation !== this.generation || this.disposed) return;
    const timeout = this.options.requestTimeoutMs ?? 15_000;
    this.deadline = setTimeout(() => {
      if (generation !== this.generation || this.disposed) return;
      this.invalidate(new DOMException('Prediction timed out', 'TimeoutError'));
      this.emit({ status: 'unavailable', candidate: null, error: 'prediction_timeout' });
    }, Number.isFinite(timeout) ? Math.max(1, Math.min(timeout, 30_000)) : 15_000);
    try {
      const candidate = await this.options.transport(request, { signal: abort.signal });
      if (this.disposed || abort.signal.aborted || generation !== this.generation) return;
      clearTimeout(this.deadline);
      if (!candidate || candidate.request_id !== request.request_id
        || candidate.session_id !== request.session_id || candidate.connection_id !== request.connection_id
        || candidate.draft_revision !== input.revision || candidate.context_revision !== request.context_revision
        || !Number.isFinite(candidate.expires_at) || candidate.expires_at * 1000 <= Date.now()) {
        this.emit({ status: 'idle', candidate: null, error: null });
        return;
      }
      if (candidate.status !== 'suggested' || typeof candidate.completion !== 'string' || !candidate.completion.trim()) {
        this.emit({ status: 'idle', candidate: null, error: null });
        return;
      }
      if (this.options.presentation === 'typewriter') {
        const letters = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(candidate.completion), part => part.segment);
        const start = Date.now();
        const duration = Math.min(1500, letters.length * 20);
        const reveal = () => {
          if (generation !== this.generation || this.disposed) return;
          const count = Math.min(letters.length, Math.ceil((Date.now() - start) / duration * letters.length));
          this.emit({ status: 'suggested', candidate, error: null, visibleCompletion: letters.slice(0, count).join('') });
          if (generation !== this.generation || this.disposed) return;
          if (count === letters.length) this.event(candidate.request_id, 'presented');
          else this.animation = setTimeout(reveal, 20);
        };
        reveal();
      } else {
        this.emit({ status: 'suggested', candidate, error: null });
        this.event(candidate.request_id, 'presented');
      }
      if (generation !== this.generation || this.disposed) return;
      this.expiry = setTimeout(() => this.dismiss(false), Math.min(60_000, candidate.expires_at * 1000 - Date.now()));
    } catch (error) {
      if (this.disposed || abort.signal.aborted || generation !== this.generation) return;
      clearTimeout(this.deadline);
      this.emit({ status: 'unavailable', candidate: null,
        error: error instanceof Error ? error.message : 'prediction_unavailable' });
    }
  }

  accept(): AcceptedCompletion | null {
    const candidate = this.state.candidate;
    const input = this.input;
    if (!candidate || !input || input.composing || !input.focused || input.enabled === false
      || input.selectionStart !== input.value.length || input.selectionEnd !== input.value.length
      || candidate.expires_at * 1000 <= Date.now()
      || this.state.visibleCompletion !== candidate.completion) return null;
    this.invalidate();
    this.emit({ status: 'idle', candidate: null, error: null });
    this.event(candidate.request_id, 'accepted');
    return { value: input.value + candidate.completion, suffix: candidate.completion, requestId: candidate.request_id };
  }

  dismiss(report = true) {
    if (report && this.state.candidate) this.event(this.state.candidate.request_id, 'dismissed');
    this.invalidate();
    this.emit({ status: 'idle', candidate: null, error: null });
  }

  dispose() {
    this.disposed = true;
    this.invalidate();
    this.listeners.clear();
  }
}

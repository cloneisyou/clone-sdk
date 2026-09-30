import { ClonePredictionError } from './http.js';

/** Includes response-body reads and resolves even if a custom transport ignores abort. */
export async function withDeadline<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number, parent?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel!: () => void;
  const stopped = new Promise<never>((_, reject) => {
    cancel = () => { controller.abort(); reject(new ClonePredictionError('prediction_cancelled', 499)); };
    timer = setTimeout(() => { controller.abort(); reject(new ClonePredictionError('prediction_timeout', 504)); }, timeoutMs);
    parent?.addEventListener('abort', cancel, { once: true });
    if (parent?.aborted) cancel();
  });
  try {
    return await Promise.race([stopped, controller.signal.aborted ? stopped : run(controller.signal)]);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', cancel);
  }
}

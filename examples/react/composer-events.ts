import type { PredictionEvent } from '@clone-ai/tab-completion';

export type ComposerEvent = Omit<PredictionEvent, 'user_id'>;
type SdkEvent = { request_id: string; kind: 'presented' | 'accepted' | 'dismissed' };

/** Host-side example. No text leaves this tracker; submission stays with the host. */
export class ComposerEvents {
  private accepted: { requestId: string; before: string; inserted: string | null; edited: boolean } | null = null;
  constructor(private readonly deliver: (event: ComposerEvent) => void) {}

  private emit(request_id: string, kind: ComposerEvent['kind']) {
    // Allocate once per observation. Any delivery retry must reuse this object.
    const event = { event_id: crypto.randomUUID(), request_id, kind };
    try { this.deliver(event); } catch { /* telemetry cannot block ordinary input */ }
  }

  observe(event: SdkEvent, before: string) {
    // The SDK emits accepted before inserting into the native textarea.
    if (event.kind === 'accepted') {
      this.accepted = { requestId: event.request_id, before, inserted: null, edited: false };
    }
    this.emit(event.request_id, event.kind);
  }

  input(value: string) {
    const accepted = this.accepted;
    if (!accepted) return;
    if (accepted.inserted === null) { accepted.inserted = value; return; }
    // Undo back to the pre-accept draft, or clearing it, removes attribution.
    if (!value.trim() || value === accepted.before) { this.reset(); return; }
    if (value !== accepted.inserted && !accepted.edited) {
      accepted.edited = true;
      this.emit(accepted.requestId, 'edited');
    }
  }

  submitted(value: string): 'human' | 'accepted_prediction' | 'edited_prediction' {
    const accepted = this.accepted;
    this.reset();
    if (accepted && accepted.inserted !== null && value.trim() && value !== accepted.before) {
      this.emit(accepted.requestId, 'submitted');
      return value === accepted.inserted ? 'accepted_prediction' : 'edited_prediction';
    }
    return 'human';
  }

  reset() { this.accepted = null; }
}

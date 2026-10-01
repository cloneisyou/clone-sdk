import { appendFile } from 'node:fs/promises';
import { createHmac, randomBytes } from 'node:crypto';

const kinds = new Set(['session', 'prediction', 'presented', 'accepted', 'edited', 'dismissed', 'submitted', 'metric',
  'rejected', 'feedback', 'outcome']);
const sources = new Set(['fixture', 'live', 'fault']);

/** Preserve the source of each prediction across late events and fault changes. */
export function createPredictionSources(source: 'fixture' | 'live') {
  const requests = new Map<string, 'fixture' | 'live' | 'fault'>();
  return {
    register(request: string, fault: boolean) {
      if (!requests.has(request)) requests.set(request, fault ? 'fault' : source);
      if (requests.size > 1000) requests.delete(requests.keys().next().value!);
      return requests.get(request)!;
    },
    get(request: unknown) {
      return typeof request === 'string' ? requests.get(request) : undefined;
    },
  };
}

/** Opt-in, local-only pilot measurements. Never store prompts, keys or user IDs. */
export function createPilotRecorder(file?: string, source = 'fixture', pilot?: string) {
  if (pilot && !/^[a-zA-Z0-9_-]{1,64}$/.test(pilot)) throw new Error('Use a non-personal pilot label');
  const salt = randomBytes(32);
  const hash = (id: unknown) => typeof id === 'string' && id.length <= 200
    ? createHmac('sha256', salt).update(id).digest('hex').slice(0, 24) : undefined;
  let pending = Promise.resolve();
  return (input: Record<string, unknown>) => {
    if (!file || !kinds.has(String(input.kind))) return;
    const record: Record<string, unknown> = {
      kind: input.kind, source: sources.has(String(input.source)) ? input.source : source,
      recorded_at: Date.now(),
    };
    if (pilot) record.pilot = pilot;
    if (typeof input.observed_at === 'number' && Math.abs(Date.now() - input.observed_at) < 86_400_000) {
      record.observed_at = input.observed_at;
    }
    for (const name of ['request_id', 'session_id', 'event_id']) {
      const value = hash(input[name]); if (value) record[name] = value;
    }
    if (typeof input.duration_ms === 'number' && Number.isFinite(input.duration_ms) && input.duration_ms >= 0) {
      record.duration_ms = Math.min(120_000, input.duration_ms);
    }
    if (typeof input.status === 'number' && Number.isInteger(input.status) && input.status >= 0 && input.status <= 599) {
      record.status = input.status;
    }
    if (['suggested', 'abstained', 'failed', 'cancelled'].includes(String(input.outcome))) record.outcome = input.outcome;
    if (typeof input.code === 'string' && /^[a-z][a-z0-9_]{0,127}$/.test(input.code)) record.code = input.code;
    if (['recorded', 'failed', 'cancelled'].includes(String(input.delivery))) record.delivery = input.delivery;
    if (input.kind === 'outcome' && ['succeeded', 'failed'].includes(String(input.outcome))) record.task_outcome = input.outcome;
    // Serialize append order; a recording failure is isolated from the composer.
    pending = pending.then(() => appendFile(file, JSON.stringify(record) + '\n', { mode: 0o600 }))
      .catch(() => { console.warn('Pilot observation could not be written'); });
  };
}

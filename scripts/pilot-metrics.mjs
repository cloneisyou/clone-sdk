import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function summarize(records) {
  const result = { sources: {}, onboarding: [], support_minutes: null, support_records: 0 };
  const starts = new Map();
  for (const row of records) {
    if (row.kind === 'onboarding_started') starts.set(row.pilot, row.recorded_at);
    if (row.kind === 'integration_verified' && starts.has(row.pilot)) {
      result.onboarding.push({ pilot: row.pilot, minutes: (row.recorded_at - starts.get(row.pilot)) / 60_000 });
      starts.delete(row.pilot);
    }
    if (row.kind === 'support' && Number.isFinite(row.minutes) && row.minutes >= 0) {
      result.support_minutes = (result.support_minutes ?? 0) + row.minutes;
      result.support_records++;
    }
  }
  for (const source of ['fixture', 'fault', 'live']) {
    const rows = records.filter(row => row.source === source);
    if (!rows.length) continue;
    const metrics = rows.filter(row => row.kind === 'metric');
    const durations = metrics.map(row => row.duration_ms).filter(Number.isFinite).sort((a, b) => a - b);
    const quantile = fraction => durations.length ? durations[Math.ceil(durations.length * fraction) - 1] : null;
    const events = new Map();
    for (const row of rows) {
      if (['accepted', 'submitted'].includes(row.kind) && row.delivery === 'recorded' && row.request_id) {
        const request = events.get(row.request_id) ?? {};
        // Exact ordered funnel uses client occurrence time. Missing timestamps
        // and failed deliveries stay outside the measured denominator.
        if (Number.isFinite(row.observed_at)) request[row.kind] = Math.min(request[row.kind] ?? Infinity, row.observed_at);
        events.set(row.request_id, request);
      }
    }
    const accepted = [...events.values()].filter(event => Number.isFinite(event.accepted));
    const submitted = accepted.filter(event => Number.isFinite(event.submitted) && event.submitted >= event.accepted);
    const decisions = new Map();
    for (const row of rows) {
      if (row.event_id && row.delivery === 'recorded' && ['rejected', 'feedback', 'outcome'].includes(row.kind)) {
        decisions.set(row.event_id, { ...decisions.get(row.event_id), ...row });
      }
    }
    const pilotSessions = new Map();
    for (const row of rows) {
      if (row.kind === 'session' && row.pilot && row.session_id) {
        const sessions = pilotSessions.get(row.pilot) ?? new Set();
        sessions.add(row.session_id); pilotSessions.set(row.pilot, sessions);
      }
    }
    result.sources[source] = {
      sessions_observed: new Set(rows.filter(row => row.kind === 'session').map(row => row.session_id).filter(Boolean)).size,
      pilots_with_repeat_sessions: [...pilotSessions.values()].filter(sessions => sessions.size > 1).length,
      prediction_attempts_observed: rows.filter(row => row.kind === 'prediction').length,
      distinct_prediction_requests: new Set(rows.filter(row => row.kind === 'prediction').map(row => row.request_id).filter(Boolean)).size,
      timed_requests: metrics.length, p50_ms: quantile(0.5), p95_ms: quantile(0.95),
      failures: metrics.filter(row => row.outcome === 'failed').length,
      timeouts: metrics.filter(row => row.code === 'prediction_timeout').length,
      cancellations: metrics.filter(row => row.outcome === 'cancelled').length,
      accepted_with_timestamps: accepted.length, submitted_after_acceptance: submitted.length,
      observed_accept_to_submit_rate: accepted.length ? submitted.length / accepted.length : null,
      failed_event_deliveries: rows.filter(row => row.delivery === 'failed').length,
      explicit_rejections: [...decisions.values()].filter(row => row.kind === 'rejected').length,
      explicit_evaluations: [...decisions.values()].filter(row => row.kind === 'feedback').length,
      host_reported_task_successes: [...decisions.values()].filter(row => row.task_outcome === 'succeeded').length,
      host_reported_task_failures: [...decisions.values()].filter(row => row.task_outcome === 'failed').length,
    };
  }
  result.coverage = 'Local opt-in observations. Sessions are not returning customers. Missing telemetry is unknown, not rejection. Fixture/fault data is not customer adoption or provider capacity.';
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, file, pilot, value] = process.argv.slice(2);
  if (!file) throw new Error('Usage: pilot-metrics.mjs report FILE | start/verified/support FILE PILOT [MINUTES]');
  if (command === 'report') {
    const rows = (await readFile(file, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    console.log(JSON.stringify(summarize(rows), null, 2));
  } else {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(pilot ?? '')) throw new Error('Use a non-personal pilot label');
    const kind = { start: 'onboarding_started', verified: 'integration_verified', support: 'support' }[command];
    if (!kind) throw new Error('Unknown observation command');
    const record = { kind, pilot, recorded_at: Date.now() };
    if (command === 'support') {
      const minutes = Number(value);
      if (!Number.isFinite(minutes) || minutes < 0 || minutes > 10_000) throw new Error('Invalid support minutes');
      record.minutes = minutes;
    }
    await appendFile(file, JSON.stringify(record) + '\n', { mode: 0o600 });
    console.log('Recorded', kind);
  }
}

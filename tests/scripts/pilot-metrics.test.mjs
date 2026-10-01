import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../../scripts/pilot-metrics.mjs';

test('pilot report separates synthetic sources and requires ordered delivered events', () => {
  const base = { source: 'live', request_id: 'anonymous-request', delivery: 'recorded' };
  const result = summarize([
    { kind: 'onboarding_started', pilot: 'pilot-a', recorded_at: 0 },
    { kind: 'integration_verified', pilot: 'pilot-a', recorded_at: 120_000 },
    { kind: 'support', minutes: 3 },
    { ...base, kind: 'accepted', observed_at: 20 },
    { ...base, kind: 'submitted', observed_at: 30 },
    { ...base, request_id: 'missing-time', kind: 'accepted' },
    { ...base, request_id: 'failed-delivery', kind: 'accepted', observed_at: 20, delivery: 'failed' },
    { ...base, request_id: 'wrong-order', kind: 'accepted', observed_at: 40 },
    { ...base, request_id: 'wrong-order', kind: 'submitted', observed_at: 30 },
    { source: 'fixture', kind: 'metric', duration_ms: 1, outcome: 'suggested' },
    { source: 'live', kind: 'metric', duration_ms: 90, outcome: 'failed' },
    { source: 'live', kind: 'session', session_id: 'anonymous-session' },
    { source: 'live', kind: 'session', session_id: 'anonymous-session' },
  ]);
  assert.deepEqual(result.onboarding, [{ pilot: 'pilot-a', minutes: 2 }]);
  assert.equal(result.support_minutes, 3);
  assert.equal(result.sources.live.accepted_with_timestamps, 2);
  assert.equal(result.sources.live.submitted_after_acceptance, 1);
  assert.equal(result.sources.live.sessions_observed, 1);
  assert.equal(result.sources.live.p95_ms, 90);
  assert.equal(result.sources.fixture.timed_requests, 1);
  assert.equal(result.sources.live.failed_event_deliveries, 1);
});

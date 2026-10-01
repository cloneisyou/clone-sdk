import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { test } from 'node:test';
import { createServer as createViteServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const close = server => new Promise(resolve => server.close(resolve));

test('feedback clearing accepts an empty browser POST and keeps subject and origin server-owned', async () => {
  const calls = [];
  const upstream = createHttpServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    calls.push({ path: req.url, body: JSON.parse(body) });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'cleared', deleted: 2 }));
  });
  await listen(upstream);
  const reservation = createHttpServer();
  await listen(reservation);
  const port = reservation.address().port;
  await close(reservation);
  Object.assign(process.env, {
    CLONE_SDK_DEMO_PORT: String(port), CLONE_DEMO_BACKEND: '1',
    CLONE_API_URL: `http://127.0.0.1:${upstream.address().port}`, CLONE_APP_KEY: 'clnp_fixture',
  });
  let proxy;
  try {
    proxy = await createViteServer({ configFile: fileURLToPath(new URL('../../examples/react/vite.config.ts', import.meta.url)) });
    await proxy.listen();
    const origin = `http://127.0.0.1:${port}`;
    const denied = await fetch(origin + '/api/clone/clear-feedback', { method: 'POST', headers: { Origin: 'https://other.example' } });
    assert.equal(denied.status, 403);
    assert.equal(calls.length, 0);
    const result = await fetch(origin + '/api/clone/clear-feedback', { method: 'POST', headers: { Origin: origin } });
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { status: 'cleared', deleted: 2 });
    assert.deepEqual(calls, [{ path: '/v1/prediction-feedback/clear', body: { user_id: 'demo-customer-user' } }]);
  } finally {
    await proxy?.close();
    await close(upstream);
  }
});

test('late fault metrics and event acknowledgments keep their admitted source after recovery', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'clone-pilot-source-'));
  const observations = join(folder, 'observations.ndjson');
  const upstream = createHttpServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(req.url === '/v1/predictions' ? {
      request_id: body.request_id, prediction_id: 'p-' + body.request_id,
      connection_id: null, session_id: body.session_id, draft_revision: body.draft.revision,
      context_revision: body.context_revision, profile_revision: '', grant_revision: 0,
      status: 'suggested', completion: ' suggestion', expires_at: Math.floor(Date.now() / 1000) + 60,
      context_truncated: false, usage: { prediction_units: 1 },
    } : { status: 'recorded' }));
  });
  await listen(upstream);
  const reservation = createHttpServer(); await listen(reservation);
  const port = reservation.address().port; await close(reservation);
  Object.assign(process.env, { CLONE_SDK_DEMO_PORT: String(port), CLONE_DEMO_BACKEND: '1',
    CLONE_DEMO_FAULTS: '1', CLONE_DEMO_PROVIDER_MODE: 'fixture', CLONE_SDK_METRICS_FILE: observations,
    CLONE_API_URL: `http://127.0.0.1:${upstream.address().port}`, CLONE_APP_KEY: 'clnp_fixture' });
  let proxy;
  const rows = async () => JSON.parse('[' + (await readFile(observations, 'utf8')).trim().split('\n').join(',') + ']');
  async function recorded(count) {
    for (let attempt = 0; attempt < 100; attempt++) {
      try { const data = await rows(); if (data.length >= count) return data; } catch {}
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Expected observation was not recorded');
  }
  try {
    proxy = await createViteServer({ configFile: fileURLToPath(new URL('../../examples/react/vite.config.ts', import.meta.url)) });
    await proxy.listen();
    const origin = `http://127.0.0.1:${port}`;
    const post = (path, body) => fetch(origin + path, { method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const request = { request_id: 'delayed-fault', session_id: 'fixture-session', mode: 'complete_draft',
      draft: { text: 'draft', revision: 1 }, context_revision: 'v1', messages: [] };
    await post('/api/clone/test-fault', { fault: 'latency' });
    const delayed = post('/api/clone/predict', request);
    await recorded(1);
    await post('/api/clone/test-fault', { fault: 'none' });
    assert.equal((await delayed).status, 200);
    await post('/api/clone/metrics', { kind: 'metric', request_id: request.request_id,
      source: 'live', outcome: 'suggested', duration_ms: 5000 });
    await post('/api/clone/events', { event_id: 'accepted-delay', request_id: request.request_id, kind: 'accepted' });
    await post('/api/clone/metrics', { event_id: 'accepted-delay', request_id: request.request_id,
      kind: 'accepted', source: 'live', delivery: 'recorded' });
    const faultRows = await recorded(4);
    assert.equal(faultRows.length, 4);
    assert.ok(faultRows.every(row => row.source === 'fault'));
    await post('/api/clone/metrics', { request_id: 'unknown', kind: 'metric', source: 'live' });
    const normal = await post('/api/clone/predict', { ...request, request_id: 'normal-fixture' });
    assert.equal(normal.status, 200);
    await post('/api/clone/metrics', { kind: 'metric', request_id: 'normal-fixture', source: 'live', outcome: 'suggested' });
    const final = await recorded(6);
    assert.deepEqual(final.map(row => row.source), ['fault', 'fault', 'fault', 'fault', 'fixture', 'fixture']);
  } finally {
    await proxy?.close(); await close(upstream);
    delete process.env.CLONE_SDK_METRICS_FILE;
    delete process.env.CLONE_DEMO_FAULTS;
  }
});

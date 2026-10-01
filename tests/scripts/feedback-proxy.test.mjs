import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { test } from 'node:test';
import { createServer as createViteServer } from 'vite';
import { fileURLToPath } from 'node:url';

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

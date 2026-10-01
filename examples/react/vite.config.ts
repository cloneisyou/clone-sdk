import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { CloneClient } from '../../src/server.js';
import { ClonePredictionError } from '../../src/transport.js';
import type { ConnectionFlow } from '../../src/server.js';
import { createPilotRecorder } from './pilot-observations.js';

const port = Number(process.env.CLONE_SDK_DEMO_PORT || 4317);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid CLONE_SDK_DEMO_PORT');
const origin = `http://127.0.0.1:${port}`;

// Loopback-only integration example. Replace this explicit fixture identity and
// in-memory session with your application's authenticated session in production.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: { host: '127.0.0.1', port, strictPort: true },
  plugins: [{ name: 'clone-local-customer-backend', configureServer(server) {
    if (process.env.CLONE_DEMO_BACKEND !== '1') return;
    if (!process.env.CLONE_API_URL || !process.env.CLONE_APP_KEY) {
      throw new Error('Connected demo requires server-only CLONE_API_URL and CLONE_APP_KEY');
    }
    const client = new CloneClient({ baseUrl: process.env.CLONE_API_URL, apiKey: process.env.CLONE_APP_KEY });
    const user = 'demo-customer-user';
    const faultsEnabled = process.env.CLONE_DEMO_FAULTS === '1';
    const faults = new Set(['none', '503', '429', '402', 'network', 'malformed', 'timeout', 'latency']);
    let fault = 'none';
    const record = createPilotRecorder(process.env.CLONE_SDK_METRICS_FILE,
      process.env.CLONE_DEMO_PROVIDER_MODE === 'live' ? 'live' : 'fixture', process.env.CLONE_SDK_PILOT_LABEL);
    let flow: ConnectionFlow | null = null;
    let connectionId = '';
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url ?? '/', origin);
      if (!url.pathname.startsWith('/api/clone/') && url.pathname !== '/callback') return next();
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Referrer-Policy', 'no-referrer');
      const json = (status: number, body: unknown) => {
        if (!res.destroyed) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); }
      };
      try {
        if (req.method === 'POST' && req.headers.origin !== origin) {
          return json(403, { detail: { code: 'invalid_origin' } });
        }
        if (url.pathname === '/callback' && req.method === 'GET') {
          if (!flow) return json(400, { detail: { code: 'missing_connect_session' } });
          const connected = await client.exchange(flow, url.searchParams, user);
          connectionId = connected.connection_id; flow = null;
          res.writeHead(303, { Location: '/?connected=1' }); res.end(); return;
        }
        if (url.pathname === '/api/clone/state' && req.method === 'GET') {
          return json(200, { connection_id: connectionId, faults_enabled: faultsEnabled });
        }
        if (url.pathname === '/api/clone/usage' && req.method === 'GET') return json(200, await client.usage());
        if (req.method !== 'POST') return json(405, { detail: { code: 'method_not_allowed' } });
        if (url.pathname === '/api/clone/connect') {
          const started = await client.connect(user, origin + '/callback');
          flow = started.flow;
          return json(200, { authorizeUrl: started.authorizeUrl });
        }
        if (url.pathname === '/api/clone/disconnect') {
          if (connectionId) await client.revoke(user, connectionId);
          connectionId = ''; return json(200, { status: 'revoked' });
        }
        let raw = '';
        for await (const chunk of req) {
          raw += chunk; if (Buffer.byteLength(raw) > 300_000) return json(413, { detail: { code: 'body_too_large' } });
        }
        const body = JSON.parse(raw);
        if (url.pathname === '/api/clone/test-fault' && faultsEnabled) {
          if (!faults.has(body.fault)) return json(400, { detail: { code: 'invalid_test_fault' } });
          fault = body.fault; return json(200, { fault });
        }
        if (url.pathname === '/api/clone/metrics') {
          record({ ...body, source: fault === 'none' ? undefined : 'fault' });
          return json(200, { status: 'recorded' });
        }
        if (url.pathname === '/api/clone/events') {
          // Preserve the client event ID so a retry cannot create a second observation.
          const { observed_at, session_id, ...event } = body;
          try {
            const result = await client.recordEvent(user, event);
            record({ ...event, observed_at, session_id, delivery: 'recorded' });
            return json(200, result);
          } catch (error) {
            record({ ...event, observed_at, session_id, delivery: 'failed' }); throw error;
          }
        }
        if (url.pathname === '/api/clone/clear-feedback') return json(200, await client.clearFeedback(user));
        // The server session owns optional personalization, never the browser body.
        if ((body.connection_id ?? null) !== (connectionId || null)) return json(403, { detail: { code: 'connection_mismatch' } });
        if (url.pathname === '/api/clone/predict') {
          record({ kind: 'prediction', request_id: body.request_id, session_id: body.session_id,
            source: fault === 'none' ? undefined : 'fault' });
          if (fault === 'network') { res.destroy(); return; }
          if (fault === 'timeout') {
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{'); return;
          }
          if (fault === 'malformed') {
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{invalid'); return;
          }
          if (['402', '429', '503'].includes(fault)) {
            res.setHeader('Retry-After', '1');
            return json(Number(fault), { detail: { code: fault === '429' ? 'rate_limited' : 'test_outage' } });
          }
          if (fault === 'latency') await new Promise(resolve => setTimeout(resolve, 5000));
          if (res.destroyed) return;
          const abort = new AbortController();
          res.on('close', () => { if (!res.writableEnded) abort.abort(); });
          return json(200, await client.predict(user, body, { signal: abort.signal }));
        }
        return json(404, { detail: { code: 'not_found' } });
      } catch (error) {
        return json(error instanceof ClonePredictionError ? error.status : 500,
          { detail: { code: error instanceof ClonePredictionError ? error.code : 'example_backend_error' } });
      }
    });
  } }],
});

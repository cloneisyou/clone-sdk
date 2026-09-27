import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { CloneClient } from '../../src/server.js';
import { ClonePredictionError } from '../../src/transport.js';
import type { ConnectionFlow } from '../../src/server.js';

// Loopback-only integration example. Replace this explicit fixture identity and
// in-memory session with your application's authenticated session in production.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: { host: '127.0.0.1', port: 4317, strictPort: true },
  plugins: [{ name: 'clone-local-customer-backend', configureServer(server) {
    if (process.env.CLONE_DEMO_BACKEND !== '1') return;
    if (!process.env.CLONE_API_URL || !process.env.CLONE_APP_KEY) {
      throw new Error('Connected demo requires server-only CLONE_API_URL and CLONE_APP_KEY');
    }
    const client = new CloneClient({ baseUrl: process.env.CLONE_API_URL, apiKey: process.env.CLONE_APP_KEY });
    const user = 'demo-customer-user';
    let flow: ConnectionFlow | null = null;
    let connectionId = '';
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1:4317');
      if (!url.pathname.startsWith('/api/clone/') && url.pathname !== '/callback') return next();
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Referrer-Policy', 'no-referrer');
      const json = (status: number, body: unknown) => {
        if (!res.destroyed) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); }
      };
      try {
        if (req.method === 'POST' && req.headers.origin !== 'http://127.0.0.1:4317') {
          return json(403, { detail: { code: 'invalid_origin' } });
        }
        if (url.pathname === '/callback' && req.method === 'GET') {
          if (!flow) return json(400, { detail: { code: 'missing_connect_session' } });
          const connected = await client.exchange(flow, url.searchParams, user);
          connectionId = connected.connection_id; flow = null;
          res.writeHead(303, { Location: '/?connected=1' }); res.end(); return;
        }
        if (url.pathname === '/api/clone/state' && req.method === 'GET') {
          return json(200, { connection_id: connectionId });
        }
        if (url.pathname === '/api/clone/usage' && req.method === 'GET') return json(200, await client.usage());
        if (req.method !== 'POST') return json(405, { detail: { code: 'method_not_allowed' } });
        if (url.pathname === '/api/clone/connect') {
          const started = await client.connect(user, 'http://127.0.0.1:4317/callback');
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
        if (url.pathname === '/api/clone/events') {
          // Preserve the client event ID so a retry cannot create a second observation.
          return json(200, await client.recordEvent(user, body));
        }
        // The server session owns optional personalization, never the browser body.
        if ((body.connection_id ?? null) !== (connectionId || null)) return json(403, { detail: { code: 'connection_mismatch' } });
        if (url.pathname === '/api/clone/predict') {
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

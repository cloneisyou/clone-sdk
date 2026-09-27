import { describe, expect, it, vi } from 'vitest';
import { CloneClient } from '../src/server.js';
import type { ConnectionFlow } from '../src/server.js';
import type { CompletionRequest, PredictionEvent } from '../src/types.js';

const request: CompletionRequest = {
  session_id: 'thread', context_revision: '1', request_id: 'request',
  mode: 'complete_draft', draft: { text: 'draft', revision: 1 },
};
const flow: ConnectionFlow = {
  requestId: 'request', userId: 'owner', state: 'state', codeVerifier: 'verifier',
  redirectUri: 'https://example.com/callback',
};

function setup() {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => Response.json({ status: 'recorded' }));
  const client = new CloneClient({ apiKey: 'clnp_fixture', baseUrl: 'https://api.example.com/', fetch });
  return { client, fetch };
}

describe('server client trust boundary', () => {
  it.each([
    'http://api.example.com', 'https://user:password@example.com', 'https://example.com?token=fixture',
    'https://example.com#fragment', 'file:///tmp/service',
  ])('rejects unsafe API base %s before network I/O', baseUrl => {
    const fetch = vi.fn();
    expect(() => new CloneClient({ apiKey: 'clnp_fixture', baseUrl, fetch })).toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects browser construction and non-app credentials', () => {
    expect(() => new CloneClient({ apiKey: 'fixture', baseUrl: 'https://example.com' })).toThrow('app-scoped');
    vi.stubGlobal('window', {});
    try { expect(() => setup()).toThrow('server'); }
    finally { vi.unstubAllGlobals(); }
  });

  it('binds prediction and event identity to the authenticated server user', async () => {
    const { client, fetch } = setup();
    const signal = new AbortController().signal;
    await client.predict('owner', { ...request, user_id: 'forged' } as CompletionRequest, { signal });
    await client.recordEvent('owner', { event_id: 'event', request_id: 'request', kind: 'accepted', user_id: 'forged' } as PredictionEvent);
    for (const [, init] of fetch.mock.calls) {
      expect(JSON.parse(init!.body as string).user_id).toBe('owner');
      expect(init!.headers).toMatchObject({ Authorization: 'Bearer clnp_fixture' });
    }
    expect(fetch.mock.calls[0]![1]!.signal).toBe(signal);
  });

  it('encodes identifiers and preserves nullable usage limits', async () => {
    const { client, fetch } = setup();
    await client.cancel('owner', 'id/with?query');
    await client.revoke('owner', 'id/with?query');
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.com/v1/predictions/id%2Fwith%3Fquery/cancel',
      'https://api.example.com/v1/connections/id%2Fwith%3Fquery/revoke',
    ]);
    fetch.mockResolvedValueOnce(Response.json({ monthly_cap_cents: null, billing_model: 'payg' }));
    expect(await client.usage()).toMatchObject({ monthly_cap_cents: null });
    expect(fetch.mock.calls.at(-1)![1]!.method).toBe('GET');
    expect(fetch.mock.calls.at(-1)![1]!.body).toBeUndefined();
  });

  it.each([
    ['state=forged&request_id=request&code=code', 'owner'],
    ['state=state&request_id=forged&code=code', 'owner'],
    ['state=state&request_id=request', 'owner'],
    ['state=state&request_id=request&code=code', 'other-user'],
  ])('rejects mismatched callback before network I/O', (callback, user) => {
    const { client, fetch } = setup();
    expect(() => client.exchange(flow, new URLSearchParams(callback), user)).toThrow('invalid_connect_callback');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('creates unpredictable PKCE state, hashes the verifier, and exchanges the bound flow', async () => {
    const { client, fetch } = setup();
    fetch.mockImplementation(async () => Response.json({ request_id: 'request', authorize_url: 'https://example.com/authorize' }));
    const first = await client.connect('owner', flow.redirectUri);
    const second = await client.connect('owner', flow.redirectUri);
    expect(first.flow.state).not.toBe(second.flow.state);
    expect(first.flow.codeVerifier).not.toBe(second.flow.codeVerifier);
    expect(first.flow.codeVerifier).toMatch(/^[A-Za-z0-9_-]{64}$/);
    const payload = JSON.parse(fetch.mock.calls[0]![1]!.body as string);
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(first.flow.codeVerifier));
    expect(payload.code_challenge).toBe(Buffer.from(hash).toString('base64url'));
    expect(payload).not.toHaveProperty('code_verifier');
    await client.exchange(first.flow, new URLSearchParams({ state: first.flow.state, request_id: 'request', code: 'code' }), 'owner');
    expect(JSON.parse(fetch.mock.calls.at(-1)![1]!.body as string)).toEqual({
      request_id: 'request', user_id: 'owner', redirect_uri: flow.redirectUri,
      code_verifier: first.flow.codeVerifier, code: 'code',
    });
  });
});

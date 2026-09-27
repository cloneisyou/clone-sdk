import type { components } from './generated/api-types.js';
import type { CompletionRequest, PredictionOutput, PredictionEvent } from './types.js';
import { ClonePredictionError, readResponse } from './http.js';

export interface ConnectionFlow {
  requestId: string; state: string; codeVerifier: string; redirectUri: string; userId: string;
}

export class CloneClient {
  #key: string;
  #base: string;
  #fetch: typeof fetch;
  constructor(options: { apiKey: string; baseUrl: string; fetch?: typeof fetch }) {
    if (typeof window !== 'undefined') throw new Error('CloneClient must only run on your server');
    const url = new URL(options.baseUrl);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
      throw new Error('Clone API must use HTTPS (loopback HTTP is development only)');
    }
    if (url.username || url.password || url.search || url.hash) throw new Error('Invalid Clone API URL');
    if (!options.apiKey.startsWith('clnp_')) throw new Error('An app-scoped Clone API key is required');
    this.#key = options.apiKey;
    this.#base = options.baseUrl.replace(/\/$/, '');
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  private async call<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await this.#fetch(this.#base + '/v1' + path, {
      method: body === undefined ? 'GET' : 'POST', signal,
      headers: { Authorization: 'Bearer ' + this.#key, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return await readResponse(response) as T;
  }

  predict(userId: string, request: CompletionRequest, options: { signal?: AbortSignal } = {}): Promise<PredictionOutput> {
    // The authenticated server identity always overwrites any untrusted body user_id.
    return this.call('/predictions', { ...request, user_id: userId }, options.signal);
  }
  recordEvent(userId: string, event: Omit<PredictionEvent, 'user_id'>): Promise<components['schemas']['EventOutput']> {
    return this.call('/prediction-events', { ...event, user_id: userId });
  }
  cancel(userId: string, requestId: string): Promise<components['schemas']['CancelOutput']> {
    return this.call('/predictions/' + encodeURIComponent(requestId) + '/cancel', { user_id: userId });
  }
  revoke(userId: string, connectionId: string): Promise<components['schemas']['RevokeOutput']> {
    return this.call('/connections/' + encodeURIComponent(connectionId) + '/revoke', { user_id: userId });
  }
  usage(): Promise<components['schemas']['UsageOutput']> {
    return this.call('/usage');
  }

  async connect(userId: string, redirectUri: string): Promise<{ authorizeUrl: string; flow: ConnectionFlow }> {
    const codeVerifier = randomToken();
    const state = randomToken();
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
    const codeChallenge = base64url(new Uint8Array(hash));
    const body: components['schemas']['ConnectionStart'] = {
      user_id: userId, redirect_uri: redirectUri, state, code_challenge: codeChallenge,
    };
    const result = await this.call<components['schemas']['ConnectionStartOutput']>('/connections', body);
    return { authorizeUrl: result.authorize_url,
      flow: { requestId: result.request_id, state, codeVerifier, redirectUri, userId } };
  }

  exchange(flow: ConnectionFlow, callback: URLSearchParams, authenticatedUserId: string): Promise<components['schemas']['ConnectionExchangeOutput']> {
    if (flow.userId !== authenticatedUserId || callback.get('state') !== flow.state
      || callback.get('request_id') !== flow.requestId || !callback.get('code')) {
      throw new ClonePredictionError('invalid_connect_callback', 400);
    }
    return this.call('/connections/exchange', {
      request_id: flow.requestId, user_id: authenticatedUserId, redirect_uri: flow.redirectUri,
      code_verifier: flow.codeVerifier, code: callback.get('code'),
    });
  }
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomToken(): string { return base64url(crypto.getRandomValues(new Uint8Array(48))); }

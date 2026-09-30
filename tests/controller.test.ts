import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompletionController } from '../src/controller.js';
import type { CompletionInput } from '../src/controller.js';
import type { CompletionRequest, PredictionOutput } from '../src/types.js';

const input = (change: Partial<CompletionInput> = {}): CompletionInput => ({
  value: '이 장을', revision: 1, focused: true, composing: false, selectionStart: 4, selectionEnd: 4,
  context: { connection_id: 'c1', session_id: 's1', context_revision: 'r1', messages: [] }, ...change,
});
const result = (request: CompletionRequest): PredictionOutput => ({
  request_id: request.request_id, prediction_id: 'pred_' + request.request_id, session_id: request.session_id,
  connection_id: request.connection_id ?? null, draft_revision: request.draft.revision, context_revision: request.context_revision,
  profile_revision: 'profile-1', grant_revision: 1, status: 'suggested', completion: ' 간결하게 해줘.',
  expires_at: Math.floor(Date.now() / 1000) + 60, context_truncated: false, usage: { prediction_units: 1 },
});

describe('completion lifecycle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it('animates whole graphemes and refuses Tab until the full candidate is visible', async () => {
    const controller = new CompletionController({ presentation: 'typewriter', debounceMs: 0,
      transport: async request => ({ ...result(request), completion: '👨‍👩‍👧‍👦 한글' }) });
    controller.update(input()); await vi.advanceTimersByTimeAsync(20);
    expect(controller.getSnapshot().visibleCompletion).toBe('👨‍👩‍👧‍👦');
    expect(controller.accept()).toBeNull();
    await vi.advanceTimersByTimeAsync(100);
    expect(controller.accept()?.suffix).toBe('👨‍👩‍👧‍👦 한글');
    controller.dispose();
  });
  it('clears animation on edits and never offers a stale prefix', async () => {
    const controller = new CompletionController({ presentation: 'typewriter', debounceMs: 0,
      transport: async request => result(request) });
    controller.update(input()); await vi.advanceTimersByTimeAsync(20);
    controller.update(input({ value: 'new draft', enabled: false }));
    await vi.advanceTimersByTimeAsync(2000);
    expect(controller.getSnapshot().visibleCompletion).toBe('');
    expect(controller.accept()).toBeNull(); controller.dispose();
  });
  it('times out ignored cancellation and drops its eventual late result', async () => {
    let finish!: () => void;
    const controller = new CompletionController({ debounceMs: 0, requestTimeoutMs: 100,
      transport: request => new Promise(resolve => { finish = () => resolve(result(request)); }) });
    controller.update(input()); await vi.advanceTimersByTimeAsync(100);
    expect(controller.getSnapshot()).toMatchObject({ status: 'unavailable', error: 'prediction_timeout' });
    finish(); await vi.advanceTimersByTimeAsync(0);
    expect(controller.accept()).toBeNull(); controller.dispose();
  });
  it('debounces, accepts only into text, and never repeats a dismissed snapshot', async () => {
    const transport = vi.fn(async request => result(request));
    const events = vi.fn();
    const controller = new CompletionController({ transport, onEvent: events });
    controller.update(input());
    await vi.advanceTimersByTimeAsync(349);
    expect(transport).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(controller.accept()?.value).toBe('이 장을 간결하게 해줘.');
    expect(controller.accept()).toBeNull();
    controller.update(input());
    await vi.advanceTimersByTimeAsync(1000);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(events.mock.calls.map(x => x[0].kind)).toEqual(['presented', 'accepted']);
    controller.dispose();
  });

  it.each([{ composing: true }, { focused: false }, { enabled: false }, { selectionStart: 0 }, { selectionEnd: 0 }])(
    'does not predict for an ineligible input %j', async change => {
      const transport = vi.fn();
      const controller = new CompletionController({ transport });
      controller.update(input(change));
      await vi.advanceTimersByTimeAsync(1000);
      expect(transport).not.toHaveBeenCalled();
      controller.dispose();
    },
  );

  it('drops stale responses even when transport ignores abort', async () => {
    const resolvers: (() => void)[] = [];
    const transport = vi.fn(request => new Promise<PredictionOutput>(resolve => resolvers.push(() => resolve(result(request)))));
    const controller = new CompletionController({ transport });
    controller.update(input());
    await vi.advanceTimersByTimeAsync(350);
    controller.update(input({ value: '새 입력', revision: 2 }));
    await vi.advanceTimersByTimeAsync(350);
    resolvers[0]!(); await Promise.resolve();
    expect(controller.getSnapshot().candidate).toBeNull();
    resolvers[1]!(); await Promise.resolve();
    expect(controller.getSnapshot().candidate?.draft_revision).toBe(2);
    controller.dispose();
  });

  it('invalidates on context/account change and expiry', async () => {
    const controller = new CompletionController({ transport: async request => result(request) });
    controller.update(input()); await vi.advanceTimersByTimeAsync(350);
    controller.update(input({ context: { connection_id: 'c2', session_id: 's2', context_revision: 'r2' } }));
    expect(controller.accept()).toBeNull();
    await vi.advanceTimersByTimeAsync(350);
    await vi.advanceTimersByTimeAsync(60_001);
    expect(controller.accept()).toBeNull();
    controller.dispose();
  });

  it('leaves typing to the host after a service error', async () => {
    const controller = new CompletionController({ transport: async () => { throw new Error('context_changed_reconnect'); } });
    controller.update(input()); await vi.advanceTimersByTimeAsync(350);
    expect(controller.getSnapshot().status).toBe('unavailable');
    expect(controller.accept()).toBeNull();
    controller.dispose();
  });

  it('caps prediction attempts separately from accepted predictions', async () => {
    const transport = vi.fn(async request => result(request));
    const controller = new CompletionController({ transport, maxRequestsPerMinute: 1 });
    controller.update(input()); await vi.advanceTimersByTimeAsync(350);
    controller.update(input({ revision: 2 })); await vi.advanceTimersByTimeAsync(350);
    expect(transport).toHaveBeenCalledTimes(1);
    controller.dispose();
  });
});

it('predicts from app context with omitted/null connection and rejects a personalized response', async () => {
  const transport = vi.fn(async (request: CompletionRequest) => result(request));
  const controller = new CompletionController({ transport, debounceMs: 0 });
  controller.update(input({ context: { session_id: 'app-session', context_revision: 'r1', user_preferences: 'Concise' } }));
  await vi.waitFor(() => expect(controller.getSnapshot().candidate).not.toBeNull());
  expect(transport.mock.calls[0]![0].connection_id).toBeNull();
  expect(controller.accept()?.value).toBe('이 장을 간결하게 해줘.');
  controller.dispose();
  const wrongScope = new CompletionController({ debounceMs: 0,
    transport: async request => ({ ...result(request), connection_id: 'unsolicited-grant' }) });
  wrongScope.update(input({ context: { session_id: 'app-session', context_revision: 'r1', connection_id: null } }));
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(wrongScope.accept()).toBeNull();
  wrongScope.dispose();
});

it('drops a late connected result after switching to app context', async () => {
  const resolvers: (() => void)[] = [];
  const controller = new CompletionController({ debounceMs: 0,
    transport: request => new Promise(resolve => resolvers.push(() => resolve(result(request)))) });
  controller.update(input());
  await vi.waitFor(() => expect(resolvers).toHaveLength(1));
  controller.update(input({ context: { session_id: 's1', context_revision: 'r1', connection_id: null } }));
  await vi.waitFor(() => expect(resolvers).toHaveLength(2));
  resolvers[0]!(); await Promise.resolve();
  expect(controller.getSnapshot().candidate).toBeNull();
  resolvers[1]!(); await Promise.resolve();
  expect(controller.getSnapshot().candidate?.connection_id).toBeNull();
  controller.update(input({ enabled: false }));
  expect(controller.accept()).toBeNull();
  controller.dispose();
});

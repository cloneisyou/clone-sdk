import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CloneModeController } from '../src/clone-mode.js';
import type { CloneModeInput } from '../src/clone-mode.js';
import type { CompletionRequest, PredictionOutput } from '../src/types.js';

const input = (change: Partial<CloneModeInput> = {}): CloneModeInput => ({
  scopeId: 'owner:thread', context: { session_id: 'thread', context_revision: '1', messages: [] },
  draft: '', enabled: true, busy: false, ...change,
});
const prediction = (r: CompletionRequest): PredictionOutput => ({
  request_id: r.request_id, prediction_id: 'prediction', session_id: r.session_id,
  connection_id: r.connection_id ?? null, draft_revision: r.draft.revision, context_revision: r.context_revision,
  profile_revision: '', grant_revision: 0, status: 'suggested', completion: 'Make the opening shorter.',
  expires_at: Date.now() / 1000 + 60, context_truncated: false, usage: { prediction_units: 1 },
});
function setup(transport = vi.fn(async (r: CompletionRequest) => prediction(r))) {
  const onSubmit = vi.fn(async () => true);
  const controller = new CloneModeController({ transport, onSubmit });
  controller.update(input());
  return { controller, transport, onSubmit };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('starts only explicitly, previews the full text, sends once, and waits for a completed host turn', async () => {
  const { controller, transport, onSubmit } = setup();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(transport).not.toHaveBeenCalled();
  expect(controller.start()).toBe(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(controller.getSnapshot()).toMatchObject({ status: 'reviewing', candidate: { completion: 'Make the opening shorter.' } });
  await vi.advanceTimersByTimeAsync(1999);
  expect(onSubmit).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(onSubmit).toHaveBeenCalledWith('Make the opening shorter.', expect.objectContaining({ origin: 'agent' }));
  expect(controller.turnCompleted()).toBe(false);
  await vi.advanceTimersByTimeAsync(5000);
  expect(transport).toHaveBeenCalledTimes(1);
  controller.update(input({ context: { session_id: 'thread', context_revision: '2', messages: [{ role: 'assistant', content: 'Done' }] } }));
  expect(controller.turnCompleted()).toBe(true);
  expect(controller.turnCompleted()).toBe(false);
  await vi.advanceTimersByTimeAsync(2000);
  expect(onSubmit).toHaveBeenCalledTimes(2);
  controller.dispose();
});

it.each([
  { draft: 'My own correction' }, { composing: true }, { enabled: false }, { visible: false },
  { scopeId: 'other-user:thread' }, { context: { session_id: 'other-thread', context_revision: '1' } },
  { context: { session_id: 'thread', context_revision: '2' } },
  { context: { session_id: 'thread', context_revision: '1', connection_id: 'other-grant' } },
])('cancels a queued send on input, availability or scope change: %j', async change => {
  const { controller, onSubmit } = setup();
  controller.start(); await vi.advanceTimersByTimeAsync(0);
  controller.update(input(change));
  await vi.advanceTimersByTimeAsync(3000);
  expect(onSubmit).not.toHaveBeenCalled();
  expect(controller.getSnapshot().status).toBe('stopped');
  controller.dispose();
});

it('honors Stop and discards a late provider response that ignored cancellation', async () => {
  let finish!: (r: PredictionOutput) => void;
  let request!: CompletionRequest;
  const transport = vi.fn((r: CompletionRequest) => { request = r; return new Promise<PredictionOutput>(resolve => { finish = resolve; }); });
  const { controller, onSubmit } = setup(transport);
  controller.start(); controller.stop(); finish(prediction(request));
  await vi.advanceTimersByTimeAsync(5000);
  expect(onSubmit).not.toHaveBeenCalled();
  expect(controller.getSnapshot().reason).toBe('user_stopped');
});

it('stops after the requested turn cap without scheduling another request', async () => {
  const { controller, transport, onSubmit } = setup();
  controller.start({ maxTurns: 1 }); await vi.advanceTimersByTimeAsync(2000);
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(controller.getSnapshot()).toMatchObject({ sent: 1, reason: 'turn_limit' });
  controller.update(input({ context: { session_id: 'thread', context_revision: '2' } }));
  expect(controller.turnCompleted()).toBe(false);
  expect(transport).toHaveBeenCalledTimes(1);
});

it.each(['abstained', 'error', 'malformed', 'expired', 'pending'])('stops on %s without submitting or retrying', async scenario => {
  const transport = vi.fn(async (r: CompletionRequest) => {
    if (scenario === 'error') throw new Error('503');
    if (scenario === 'pending') return new Promise<PredictionOutput>(() => {});
    return { ...prediction(r), ...(scenario === 'abstained' ? { status: 'abstained' as const, completion: '' }
      : scenario === 'expired' ? { expires_at: Date.now() / 1000 + 1 } : { session_id: 'wrong' }) };
  });
  const { controller, onSubmit } = setup(transport);
  controller.start(); await vi.advanceTimersByTimeAsync(20_000);
  expect(controller.getSnapshot().status).toBe('stopped');
  expect(onSubmit).not.toHaveBeenCalled(); expect(transport).toHaveBeenCalledTimes(1);
});

it('blocks restarting while an unknown host send is still pending', async () => {
  let settle!: (accepted: boolean) => void;
  const onSubmit = vi.fn(() => new Promise<boolean>(resolve => { settle = resolve; }));
  const controller = new CloneModeController({ transport: async r => prediction(r), onSubmit });
  controller.update(input()); controller.start(); await vi.advanceTimersByTimeAsync(2000);
  controller.stop(); expect(controller.start()).toBe(false);
  expect(onSubmit.mock.calls).toHaveLength(1);
  settle(true); await vi.advanceTimersByTimeAsync(0);
  expect(controller.getSnapshot().reason).toBe('user_stopped');
  expect(controller.start()).toBe(true); controller.dispose();
});


it.each(['predicting', 'submitting'])('honors synchronous Stop from a %s subscriber before external work', async status => {
  const { controller, transport, onSubmit } = setup();
  controller.subscribe(() => { if (controller.getSnapshot().status === status) controller.stop(); });
  controller.start(); await vi.advanceTimersByTimeAsync(5000);
  expect(onSubmit).not.toHaveBeenCalled();
  if (status === 'predicting') expect(transport).not.toHaveBeenCalled();
  controller.dispose();
});

it('honors the time limit and cannot restart a disposed controller', async () => {
  const { controller, onSubmit } = setup();
  controller.start({ maxDurationMs: 1000 }); await vi.advanceTimersByTimeAsync(5000);
  expect(onSubmit).not.toHaveBeenCalled();
  expect(controller.getSnapshot().reason).toBe('time_limit');
  controller.dispose(); expect(controller.start()).toBe(false);
});

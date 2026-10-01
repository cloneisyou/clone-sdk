import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AssistantRuntimeProvider, ComposerPrimitive, useExternalStoreRuntime } from '@assistant-ui/react';
import type { ThreadMessageLike } from '@assistant-ui/react';
import { TabCompletionInput } from '../../src/react.js';
import { CloneComposerInput } from '../../src/assistant-ui.js';
import { createPredictionTransport } from '../../src/transport.js';
import { createEventTransport } from '../../src/feedback.js';
import type { CompletionRequest, PredictionTransport } from '../../src/types.js';
import { CloneModeDemo } from './mode-demo.js';
import { ComposerEvents } from './composer-events.js';
import type { ComposerEvent } from './composer-events.js';

const fixture = new URLSearchParams(location.search).get('connected') !== '1';
const assistant = new URLSearchParams(location.search).get('assistant') === '1';
const sessionId = crypto.randomUUID();

function measure(body: Record<string, unknown>) {
  if (!fixture) void fetch('/api/clone/metrics', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, session_id: sessionId, observed_at: Date.now() }) }).catch(() => {});
}
type ConversationTurn = NonNullable<CompletionRequest['messages']>[number] & { role: 'user' | 'assistant' };

const mockTransport: PredictionTransport = async (request, { signal }) => {
  await new Promise(resolve => setTimeout(resolve, 50));
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  return { request_id: request.request_id, prediction_id: 'pred_' + request.request_id,
    session_id: request.session_id, connection_id: request.connection_id ?? null,
    draft_revision: request.draft.revision, context_revision: request.context_revision,
    profile_revision: request.connection_id ? 'fixture-profile' : '', grant_revision: request.connection_id ? 1 : 0, status: 'suggested',
    completion: request.artifact?.kind === 'video' ? ' 더 짧게 편집해줘.' : ' 결론부터 정리해줘.',
    expires_at: Math.floor(Date.now() / 1000) + 60, context_truncated: false, usage: { prediction_units: 1 } };
};

function Demo() {
  const [value, setValue] = useState('');
  const [kind, setKind] = useState<'video' | 'slides'>('video');
  const [revision, setRevision] = useState(1);
  const [connection, setConnection] = useState('');
  const [disconnecting, setDisconnecting] = useState(false);
  const [receipts, setReceipts] = useState<string[]>([]);
  const [conversation, setConversation] = useState<ConversationTurn[]>([
    { role: 'assistant', content: '초안이 준비됐어요. 검토해주세요.', origin: 'agent' },
  ]);
  const [conversationRevision, setConversationRevision] = useState(1);
  const [error, setError] = useState('');
  const [faultsEnabled, setFaultsEnabled] = useState(false);
  const [fault, setFault] = useState('none');
  const [collectText, setCollectText] = useState(false);
  const [guidance, setGuidance] = useState('');
  const [lastRequest, setLastRequest] = useState('');
  const [feedbackRevision, setFeedbackRevision] = useState('');
  const composer = useRef<HTMLDivElement>(null);
  const [events, setEvents] = useState<(ComposerEvent & { delivery: 'pending' | 'recorded' | 'failed' | 'cancelled' | 'fixture' })[]>([]);
  const eventTransport = useMemo(() => createEventTransport('/api/clone/events'), []);
  const telemetry = useMemo(() => new ComposerEvents((event, options) => {
    setEvents(items => [...items.slice(-99), { ...event, delivery: fixture ? 'fixture' : 'pending' }]);
    if (!fixture) return eventTransport(event, options);
  }, { collectSubmittedText: collectText, onDelivery: receipt => {
    if (fixture) return;
    const delivery = receipt.status;
    setEvents(items => items.map(item => item.event_id === receipt.event_id ? { ...item, delivery } : item));
    measure({ ...receipt, delivery });
  } }), [eventTransport, collectText]);
  useEffect(() => () => telemetry.reset(), [telemetry]);
  const observe = (event: Parameters<ComposerEvents['observe']>[0]) => {
    if (event.kind === 'presented') setLastRequest(event.request_id);
    telemetry.observe(event, composer.current?.querySelector('textarea')?.value ?? '');
  };
  const predictionTransport = useMemo(() => fixture ? mockTransport : createPredictionTransport('/api/clone/predict', {
    onMetric: metric => measure({ kind: 'metric', duration_ms: metric.durationMs, status: metric.status, outcome: metric.outcome, code: metric.code }),
  }), []);
  const transport = useMemo<PredictionTransport>(() => async (request, options) => {
    const result = await predictionTransport(request, options);
    if (!options.signal.aborted) setFeedbackRevision(result.feedback_revision ?? '');
    return result;
  }, [predictionTransport]);
  const context: Omit<CompletionRequest, 'draft' | 'mode' | 'request_id'> = {
    connection_id: connection || null, session_id: sessionId, context_revision: `${revision}:${conversationRevision}`, language: 'ko',
    messages: conversation,
    artifact: { kind, id: kind === 'video' ? 'timeline-1' : 'deck-1', revision: String(revision),
      selection: kind === 'video' ? 'clip-1 / 00:00–00:08' : 'slide-2', summary: '짧은 제품 소개 초안' },
  };
  function submitted(text: string) {
    const origin = telemetry.submitted(text);
    setReceipts(items => [...items, text]);
    setConversation(items => [...items.slice(-29), { role: 'user', content: text, origin }]);
    setConversationRevision(n => n + 1);
  }
  const messages: ThreadMessageLike[] = conversation.map(({ role, content }) => ({
    role, content: [{ type: 'text', text: content }],
  }));
  const runtime = useExternalStoreRuntime({ messages, convertMessage: message => message, onNew: async message => {
    submitted(message.content.filter(part => part.type === 'text').map(part => part.text).join(''));
  } });
  async function connect() {
    try {
      const response = await fetch('/api/clone/connect', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      location.assign(data.authorizeUrl);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Connection failed'); }
  }
  useEffect(() => {
    if (!fixture) {
      measure({ kind: 'session' });
      void fetch('/api/clone/state').then(r => r.json()).then(data => {
        setConnection(data.connection_id ?? ''); setFaultsEnabled(data.faults_enabled === true);
      }).catch(() => setError('Example backend unavailable. Manual send still works.'));
    }
  }, []);
  async function disconnect() {
    telemetry.reset(); setDisconnecting(true); setError('');
    try {
      const response = await fetch('/api/clone/disconnect', { method: 'POST' });
      if (!response.ok) throw new Error('Could not disconnect; retry or refresh connection.');
      setConnection('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Disconnect failed'); }
    finally { setDisconnecting(false); }
  }
  async function readConnection() {
    const response = await fetch('/api/clone/state');
    const data = await response.json();
    if (data.connection_id !== connection) telemetry.reset();
    setConnection(data.connection_id ?? '');
  }
  return <main style={{ maxWidth: 700, margin: '60px auto', font: '16px/1.6 system-ui', padding: 24 }}>
    <p style={{ color: '#64748b' }}>Clone · Tab Completion integration example</p>
    <h1>Complete your next instruction</h1>
    <p>{fixture ? 'Fixture mode: deterministic suggestions for interaction tests.' : 'API mode: suggestions from your product context. Clone personalization is optional.'}</p>
    {faultsEnabled && <label>Local proxy fault <select aria-label="Local proxy fault" value={fault} onChange={event => {
      const next = event.target.value;
      void fetch('/api/clone/test-fault', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fault: next }) }).then(response => {
          if (response.ok) { telemetry.reset(); setFault(next); setRevision(n => n + 1); }
        }).catch(() => setError('Could not change the local test fault.'));
    }}>{['none', '503', '429', '402', 'network', 'malformed', 'timeout', 'latency'].map(value =>
      <option key={value} value={value}>{value}</option>)}</select></label>}
    <label>Context <select aria-label="Context" value={kind} onChange={event => {
      telemetry.reset();
      setKind(event.target.value as 'video' | 'slides'); setRevision(n => n + 1);
    }}><option value="video">Video timeline example</option><option value="slides">Slide deck example</option></select></label>
    <p>Selected: {context.artifact?.selection} · revision {revision}</p>
    {!fixture && <details><summary>Optional personalization</summary><p><button onClick={() => void connect()}>Connect Clone</button>{' '}
      <button onClick={() => void readConnection()}>Refresh connection</button>{' '}
      {connection && <button disabled={disconnecting} onClick={() => void disconnect()}>Disconnect</button>}{' '}
      <span data-testid="connection">{connection ? 'Connected' : 'Product context'}</span></p></details>}
    <p>Tab accepts a suggestion. You choose when to send.</p>
    <div ref={composer} onInput={event => {
      if (event.target instanceof HTMLTextAreaElement) telemetry.input(event.target.value);
    }}>{assistant ? <AssistantRuntimeProvider runtime={runtime}><ComposerPrimitive.Root>
      <CloneComposerInput aria-label="Instruction" rows={5} context={context} transport={transport} enabled={!disconnecting} onEvent={observe} />
      <ComposerPrimitive.Send>Send</ComposerPrimitive.Send>
    </ComposerPrimitive.Root></AssistantRuntimeProvider> : <form onSubmit={event => {
      event.preventDefault(); if (value.trim()) { submitted(value); setValue(''); }
    }}>
      <TabCompletionInput aria-label="Instruction" rows={5} value={value} onValueChange={next => { telemetry.input(next); setValue(next); }}
        context={context} transport={transport} enabled={!disconnecting} onEvent={observe}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
            event.preventDefault(); event.currentTarget.form?.requestSubmit();
          }
        }} />
      <button type="submit">Send</button>
    </form>}</div>
    <p role="alert">{error}</p>
    <details><summary>Feedback loop · test fixture</summary>
      <label><input type="checkbox" checked={collectText} onChange={event => setCollectText(event.target.checked)} />
        Share edited submission text (optional)</label>
      <p><button disabled={!lastRequest} onClick={() => telemetry.feedback(lastRequest, { rating: 'positive' })}>Helpful</button>{' '}
        <button disabled={!lastRequest} onClick={() => telemetry.rejected(lastRequest, { reason: 'too_long' })}>Reject: too long</button></p>
      <label>Feedback guidance <input value={guidance} onChange={event => setGuidance(event.target.value)} /></label>{' '}
      <button disabled={!lastRequest || !guidance.trim()} onClick={() => {
        telemetry.feedback(lastRequest, { rating: 'negative', guidance, content_opt_in: true }); setGuidance('');
      }}>Send feedback</button>{' '}
      <button onClick={() => {
        if (!fixture) void fetch('/api/clone/clear-feedback', { method: 'POST' }).then(async response => {
          if (!response.ok) throw new Error('Feedback clear failed');
          setFeedbackRevision(''); setLastRequest(''); telemetry.reset();
        }).catch(() => setError('Could not clear feedback.'));
      }}>Clear feedback</button>
      <p>Injected feedback revision: <code data-testid="feedback-revision">{feedbackRevision || 'none'}</code></p>
    </details>
    <h2>Host submit receipts · test fixture</h2>
    <p data-testid="receipt-count">{receipts.length}</p>
    <ul>{receipts.map((text, index) => <li key={index}>{text}</li>)}</ul>
    <details><summary>Observation delivery · test fixture</summary>
      <pre data-testid="observation-events">{JSON.stringify(events, null, 2)}</pre>
    </details>
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode>{new URLSearchParams(location.search).get('clone-mode') === '1' ? <CloneModeDemo /> : <Demo />}</StrictMode>);

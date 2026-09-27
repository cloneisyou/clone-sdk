import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AssistantRuntimeProvider, ComposerPrimitive, useExternalStoreRuntime } from '@assistant-ui/react';
import type { ThreadMessageLike } from '@assistant-ui/react';
import { TabCompletionInput } from '../../src/react.js';
import { CloneComposerInput } from '../../src/assistant-ui.js';
import { createPredictionTransport } from '../../src/transport.js';
import type { CompletionRequest, PredictionTransport } from '../../src/types.js';
import { ComposerEvents } from './composer-events.js';
import type { ComposerEvent } from './composer-events.js';

const fixture = new URLSearchParams(location.search).get('connected') !== '1';
const assistant = new URLSearchParams(location.search).get('assistant') === '1';
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
  const composer = useRef<HTMLDivElement>(null);
  const [events, setEvents] = useState<(ComposerEvent & { delivery: 'pending' | 'recorded' | 'failed' | 'fixture' })[]>([]);
  const telemetry = useMemo(() => new ComposerEvents(event => {
    setEvents(items => [...items.slice(-99), { ...event, delivery: fixture ? 'fixture' : 'pending' }]);
    if (!fixture) void (async () => {
      let delivery: 'recorded' | 'failed' = 'failed';
      try {
        const response = await fetch('/api/clone/events', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event) });
        if (response.ok && (await response.json()).status === 'recorded') delivery = 'recorded';
      } catch { /* failed telemetry never blocks typing or host submission */ }
      setEvents(items => items.map(item => item.event_id === event.event_id ? { ...item, delivery } : item));
    })();
  }), []);
  const observe = (event: Parameters<ComposerEvents['observe']>[0]) =>
    telemetry.observe(event, composer.current?.querySelector('textarea')?.value ?? '');
  const transport = useMemo(() => fixture ? mockTransport : createPredictionTransport('/api/clone/predict'), []);
  const context: Omit<CompletionRequest, 'draft' | 'mode' | 'request_id'> = {
    connection_id: connection || null, session_id: 'example-session', context_revision: `${revision}:${conversationRevision}`, language: 'ko',
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
    if (!fixture) void fetch('/api/clone/state').then(r => r.json()).then(data => setConnection(data.connection_id ?? ''));
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
    <h2>Host submit receipts · test fixture</h2>
    <p data-testid="receipt-count">{receipts.length}</p>
    <ul>{receipts.map((text, index) => <li key={index}>{text}</li>)}</ul>
    <details><summary>Observation delivery · test fixture</summary>
      <pre data-testid="observation-events">{JSON.stringify(events, null, 2)}</pre>
    </details>
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Demo /></StrictMode>);

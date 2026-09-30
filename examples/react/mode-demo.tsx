import { useEffect, useMemo, useState } from 'react';
import { TabCompletionInput, useCloneMode } from '../../src/react.js';
import { ComposerEvents } from './composer-events.js';
import type { CompletionRequest, PredictionTransport } from '../../src/types.js';

/** Local fixture only: no network, customer data, payment, or real agent execution. */
export function CloneModeDemo() {
  const [draft, setDraft] = useState('');
  const attribution = useMemo(() => new ComposerEvents(() => {}), []);
  const [presentation, setPresentation] = useState<'instant' | 'typewriter'>('instant');
  const [fault, setFault] = useState('healthy');
  const [busy, setBusy] = useState(false);
  const [composing, setComposing] = useState(false);
  const [revision, setRevision] = useState(1);
  const [finished, setFinished] = useState(0);
  const [receipts, setReceipts] = useState<{ text: string; origin: 'human' | 'agent' | 'accepted_prediction' | 'edited_prediction' }[]>([]);
  const transport = useMemo<PredictionTransport>(() => async request => {
    if (fault === 'pending') return new Promise(() => {});
    if (fault === 'invalid') return JSON.parse('{invalid');
    if (fault !== 'healthy') throw new Error(`Fixture ${fault}`);
    return {
      request_id: request.request_id, prediction_id: `pred_${request.request_id}`,
      session_id: request.session_id, connection_id: null,
      draft_revision: request.draft.revision, context_revision: request.context_revision,
      profile_revision: '', grant_revision: 0, status: 'suggested',
      completion: '이 영상을 30초로 줄이고 핵심 장면부터 보여줘.',
      expires_at: Math.floor(Date.now() / 1000) + 60, context_truncated: false,
      usage: { prediction_units: 1 },
    };
  }, [fault]);
  const context: Omit<CompletionRequest, 'draft' | 'mode' | 'request_id'> = {
    session_id: 'fixture-thread', context_revision: String(revision), language: 'ko',
    messages: receipts.slice(-28).map(item => ({ role: 'user', content: item.text, origin: item.origin })),
    artifact: { kind: 'video', id: 'fixture-timeline', revision: String(revision), summary: '제품 소개 초안' },
  };
  function submit(text: string, origin: 'human' | 'agent' | 'accepted_prediction' | 'edited_prediction') {
    setReceipts(items => [...items, { text, origin }]);
    setRevision(n => n + 1); setBusy(true);
  }
  const mode = useCloneMode({
    transport, requestTimeoutMs: 1200, reviewMs: 3000,
    input: { scopeId: 'fixture-user:fixture-thread', context, draft, enabled: true, busy, composing },
    onSubmit: async (text, { origin, signal }) => {
      if (signal.aborted) return false;
      submit(text, origin); return true;
    },
  });
  const active = !['off', 'stopped'].includes(mode.state.status);
  useEffect(() => {
    // A real host calls this from its completed-turn event with refreshed context.
    if (finished > 0 && !busy && mode.state.status === 'waiting') mode.turnCompleted();
  }, [finished, busy, mode.state.status, mode.turnCompleted]);
  return <main style={{ maxWidth: 780, margin: '40px auto', padding: 24, font: '16px/1.6 system-ui' }}>
    <p>Clone SDK 0.4.0 candidate · local interaction fixture</p>
    <h1>Your composer stays in control</h1>
    <p>These are deterministic suggestions. No external agent or billable API is called.</p>
    <label>Suggestion display <select aria-label="Suggestion display" value={presentation}
      onChange={event => setPresentation(event.target.value as typeof presentation)}>
      <option value="instant">Instant (default)</option><option value="typewriter">Typewriter</option>
    </select></label>{' '}
    <label>Prediction service <select aria-label="Prediction service" value={fault}
      onChange={event => { mode.stop(); setFault(event.target.value); }}>
      {['healthy', '503', '429', '402', 'network', 'invalid', 'pending'].map(item => <option key={item}>{item}</option>)}
    </select></label>
    <form onSubmit={event => { event.preventDefault(); if (draft.trim()) { mode.stop(); submit(draft, attribution.submitted(draft)); setDraft(''); } }}>
      <p>Tab inserts a fully visible suggestion. Enter or Send uses the normal host send path.</p>
      <TabCompletionInput aria-label="Instruction" rows={4} value={draft} onValueChange={next => { attribution.input(next); setDraft(next); }}
        onEvent={event => attribution.observe(event, draft)}
        context={context} transport={transport} presentation={presentation} requestTimeoutMs={1200}
        enabled={!busy && !active} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}
        onKeyDown={event => {
          if (event.key === 'Escape') mode.stop();
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
            event.preventDefault(); event.currentTarget.form?.requestSubmit();
          }
        }} />
      <button type="submit">Send</button>
    </form>
    <section style={{ border: '1px solid #aaa', borderRadius: 12, padding: 20, marginTop: 24 }} aria-label="Clone mode">
      <h2 style={{ marginTop: 0 }}>Optional Clone mode</h2>
      <p>Start delegates up to 3 sends for 5 minutes. Each suggestion is shown for 3 seconds before sending.
        Typing, Stop, errors or switching tabs stop the run. Already accepted sends cannot be recalled.</p>
      <button disabled={active || busy || !!draft} onClick={() => mode.start()}>Start Clone mode</button>{' '}
      <button disabled={!active} onClick={() => mode.stop()}>Stop</button>
      <p role="status">{mode.state.status} · {mode.state.sent}/{mode.state.maxTurns} automatic sends {mode.state.reason ? `· ${mode.state.reason}` : ''}</p>
      {mode.state.candidate && <blockquote data-testid="clone-preview">{mode.state.candidate.completion}</blockquote>}
      <button disabled={!busy} onClick={() => { setBusy(false); setRevision(n => n + 1); setFinished(n => n + 1); }}>
        Complete fixture agent turn
      </button>
      <p>The next send waits for this explicit host completion signal.</p>
    </section>
    <h2>Host send receipts: {receipts.length}</h2>
    <ol>{receipts.map((item, index) => <li key={index}>{item.origin}: {item.text}</li>)}</ol>
  </main>;
}

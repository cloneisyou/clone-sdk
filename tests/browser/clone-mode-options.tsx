import { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useCloneMode } from '../../src/react.js';

/** Isolated browser regression fixture; host receipts deliberately ignore abort. */
function OptionsFixture() {
  const [reviewMs, setReviewMs] = useState(1000);
  const [requestTimeoutMs, setRequestTimeoutMs] = useState(5000);
  const [receipts, setReceipts] = useState(0);
  const settle = useRef<((accepted: boolean) => void) | null>(null);
  const mode = useCloneMode({
    reviewMs, requestTimeoutMs,
    input: { scopeId: 'fixture-user:thread', context: { session_id: 'thread', context_revision: '1', messages: [] },
      draft: '', enabled: true, busy: false },
    transport: async request => ({
      request_id: request.request_id, prediction_id: 'fixture-prediction', session_id: request.session_id,
      connection_id: request.connection_id ?? null, draft_revision: 0, context_revision: request.context_revision,
      profile_revision: '', grant_revision: 0, status: 'suggested', completion: 'Shorten the introduction.',
      expires_at: Date.now() / 1000 + 60, context_truncated: false, usage: { prediction_units: 1 },
    }),
    onSubmit: async () => {
      setReceipts(count => count + 1);
      return new Promise<boolean>(resolve => { settle.current = resolve; });
    },
  });
  return <section aria-label="Options fixture">
    <button onClick={() => mode.start()}>Start fixture</button>
    <button onClick={() => setReviewMs(2000)}>Change reviewMs</button>
    <button onClick={() => setRequestTimeoutMs(6000)}>Change requestTimeoutMs</button>
    <button onClick={() => settle.current?.(true)}>Settle host receipt</button>
    <p data-testid="fixture-status">{mode.state.status}: {mode.state.reason}</p>
    <p data-testid="fixture-receipts">{receipts}</p>
  </section>;
}

const fixture = document.createElement('div');
document.body.append(fixture);
createRoot(fixture).render(<StrictMode><OptionsFixture /></StrictMode>);

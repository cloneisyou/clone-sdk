# Clone mode

## Separate suggestions from delegation

Normal Tab completion never sends. Clone mode is an optional SDK 0.4.0 API that the customer must choose to expose. It starts only after the end user selects Start. No restored toggle, component mount, double Tab or prediction response starts it implicitly.

Default bounds are three sends and five minutes. The host can choose one to 100 sends and a time bound up to one hour. The full next prompt is visible for at least one second (two seconds by default) before it is submitted. Always render the candidate, remaining turns, state and a visible Stop control.

## Headless integration

```ts
import { CloneModeController } from '@clone-ai/tab-completion';
const mode = new CloneModeController({
  transport,
  onSubmit: async (text, { requestId, origin, signal }) => {
    // Check the signal and use the normal authorized host send path.
    if (signal.aborted) return false;
    return host.send(text, { requestId, origin, signal });
  },
});
mode.update({ scopeId: authenticatedUser.id + ':' + thread.id,
  context, draft: '', enabled: true, busy: false });
// From the user's explicit Start button only:
mode.start({ maxTurns: 3, maxDurationMs: 300000 });
// After the host has finished the turn and provided a new context revision:
mode.update(nextInput);
mode.turnCompleted();
// From Stop, logout, navigation, or a host execution failure:
mode.stop();
```

React hosts can use `useCloneMode` from the `/react` entry. Supply the same input and callbacks, render `state.candidate.completion` during review, and call `turnCompleted()` after the real host turn finishes with fresh context. Disable ordinary background predictions while mode is active to avoid duplicate work.

The host's `onSubmit` resolves true only after it accepted the send. It does not grant permission to purchases, publishing, file deletion or other host actions. Preserve the host's existing approval boundaries. Stop prevents future work and aborts the signal; it cannot retract a send already accepted by the host.

## Stop conditions and attribution

Draft edits, IME input, logout/disable, account or thread switches, changed personalization grants, hidden-page state in React, stale context during review, abstention, expiry, prediction errors and send failure stop the mode. There is no automatic retry. A pending unknown host send blocks restart until its receipt settles, preventing duplicate sends.

Only continue after an acknowledged host turn and a new context revision. Automatic messages use origin `agent`, not `human`. Personalized inference is a separate option; enabling Clone mode does not connect a Clone account or expand its selected sources. A server outage leaves manual typing and sending available.

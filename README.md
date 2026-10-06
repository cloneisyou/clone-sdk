# Clone SDK

Add next-prompt prediction and Tab completion to your existing composer. Suggestions appear as ghost text. **Tab inserts; your application decides when to send.**

**SDK 0.7.1:** instant display remains the default. Set `presentation="typewriter"` for a cancellable display animation after the complete JSON response arrives; the API does not stream. These options and Clone mode are absent from the 0.3.1 package. Keep ordinary typing and sending available when predictions are loading, fail, or never return. See the [rendering contract](docs/agent-integration.md#suggestion-rendering-contract) before building a custom editor adapter.

Use your product's conversation, selected artifact and user preferences as context. Your end users do not need a Clone account. Connecting a user's Clone context is optional.

Unreleased media support prepares selected image, original video/audio and audio artifacts locally. An explicit prediction uploads those sources and returns an independent structured review before the suggested prompt. Matching SDK/API builds and provider configuration are required. See [media context and coverage](docs/context-mapping.md).

- **Headless controller** for custom editors.
- **React hook and textarea**, plus an optional assistant-ui adapter.
- **Server client** for prediction, usage and optional account connection.
- **Python server client**, with sync and async interfaces. See [Python installation and usage](https://github.com/cloneisyou/clone-sdk/blob/main/python/README.md).
- **Optional Clone mode**, explicitly started by the end user, with preview, Stop and bounded automatic sends. See [Clone mode](docs/clone-mode.md).
- **Direct HTTPS API** for any backend or custom interface. See [API integration](docs/api.md).
- **MIT licensed SDK.** The hosted prediction API is a separate service that requires a server-side app key. See [service boundaries](docs/data-and-service.md) and [billing](docs/billing.md).

## Quick start

Open your product repository in your coding agent and paste:

```text
Read https://clone.is/docs/sdk-quickstart and integrate Clone SDK into this product using the documented npm version and a lockfile. Discover our composer, backend and authentication; reuse existing setup and keep app keys server-side. Wire prediction, acceptance, edits, explicit evaluations and rejection, successful submission and observed task outcomes through the authenticated backend. Preserve typing, IME, Undo and manual sending during delays and outages. Ask only about unresolved product choices; keep personalization, automatic sending, feedback text collection and paid usage opt-in. Verify the actual integration and report installation, feedback delivery, outage results and pending live/customer checks separately.
```

Your agent will handle setup, integration and verification. Production onboarding includes company account, app registration, pricing and card setup before SDK installation. You personally complete login, billing consent and card entry; no fee is charged at card registration. Choose **Try the free sandbox** for a separate card-free evaluation.

<details>
<summary>Manual setup</summary>

First complete [production app and card setup](https://clone.is/developer/apps?setup=production), or explicitly choose the [free sandbox](https://clone.is/developer/apps?setup=sandbox). Save the one-time app key on your backend before leaving the console. Then install the package below.

Node **22.13+**, ESM. React integrations support **18 and 19**. The headless controller and server client do not require React.

Install the public npm package. Existing integrations can keep their pinned version while validating an upgrade:

```sh
npm install --save-exact @clone-ai/prompt-prediction@0.7.1
```

Use your project's package manager and commit its lockfile. Verified [GitHub release archives](docs/releases.md#download-and-install) remain available. Hosted API access requires a separate app key.

```tsx
'use client';
import { useState } from 'react';
import { createPredictionTransport } from '@clone-ai/prompt-prediction';
import { TabCompletionInput } from '@clone-ai/prompt-prediction/react';

const transport = createPredictionTransport('/api/clone/predict');

export function Composer({ threadId, contextRevision }: {
  threadId: string;
  contextRevision: string;
}) {
  const [value, setValue] = useState('');

  return (
    <TabCompletionInput
      aria-label="Instruction"
      value={value}
      onValueChange={setValue}
      transport={transport}
      context={{
        session_id: threadId,
        context_revision: contextRevision,
        language: 'auto',
        messages: [],
      }}
    />
  );
}
```

Implement `/api/clone/predict` in your authenticated backend using `CloneClient` from `@clone-ai/prompt-prediction/server`. Derive the user ID from the server session. Keep the app key on the server, never in browser code or `VITE_*` / `NEXT_PUBLIC_*` variables. Pass your real conversation and advance `context_revision` when it changes.

For complete setup and verification, follow the [integration guide](docs/start.md).

</details>

## Try the demo

```sh
git clone https://github.com/cloneisyou/clone-sdk.git
cd clone-sdk
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open [localhost:4317](http://127.0.0.1:4317). Type, accept with Tab, then send explicitly. Add `?assistant=1` to try assistant-ui. The default demo uses synthetic suggestions and sends nothing to Clone.

For a connected proxy, outage testing and private measurements, follow [pilot validation](docs/pilot-validation.md). Synthetic checks, real model calls and customer acceptance are separate evidence.

## Choose an entry point

| Import | Use it for |
| --- | --- |
| `@clone-ai/prompt-prediction` | Controller, browser transport, errors and public types |
| `@clone-ai/prompt-prediction/react` | `useTabCompletion` or `TabCompletionInput` |
| `@clone-ai/prompt-prediction/assistant-ui` | `CloneComposerInput` inside an existing assistant-ui composer |
| `@clone-ai/prompt-prediction/server` | `CloneClient` and optional PKCE connection flow |

The React input uses a native textarea. Rich-text editors need an insertion and Undo adapter around the controller. The assistant-ui adapter targets `@assistant-ui/react@0.15.21` and uses its `unstable_useComposerInput` hook; verify compatibility before upgrading it.

## Develop

```sh
pnpm check
pnpm exec playwright install chromium
pnpm test:browser
pnpm test:package
```

Package tests install the actual archive into React 18 and 19 consumers and verify build, Tab insertion, Undo, explicit send and context changes. These checks do not establish suggestion quality, native OS IME behavior or acceptance in your application.

See [Contributing](CONTRIBUTING.md) for the repository layout and validation commands, [context mapping](docs/context-mapping.md) for request design, [reliability](docs/reliability.md) for outage handling and limits, and [Releases](docs/releases.md) for distribution.

[Security](SECURITY.md) · [Changelog](CHANGELOG.md) · [MIT license](LICENSE)

## Feedback loop

SDK 0.7.1 can return explicit rejection, evaluations, edited successful submissions and host-observed outcomes to the API. Wire the packaged tracker to your host send and authenticated proxy. Text collection is off by default. See [feedback integration](docs/feedback.md) for scoped memory, delivery, expiry and clearing. These features require the API feedback deployment; event collection alone is not model learning.

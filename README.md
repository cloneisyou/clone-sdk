# Clone SDK

Add next-prompt prediction and Tab completion to your existing composer. Suggestions appear as ghost text. **Tab inserts; your application decides when to send.**

Use your product's conversation, selected artifact and user preferences as context. Your end users do not need a Clone account. Connecting a user's Clone context is optional.

- **Headless controller** for custom editors.
- **React hook and textarea**, plus an optional assistant-ui adapter.
- **Server client** for prediction, usage and optional account connection.
- **MIT licensed SDK.** The hosted prediction API is a separate service that requires a server-side app key. See [service boundaries](docs/data-and-service.md) and [billing](docs/billing.md).

## Quick start

Open your product repository in your coding agent and paste:

```text
Read https://github.com/cloneisyou/clone-sdk/blob/main/docs/start.md and integrate Clone SDK into this product.
```

Your agent will handle setup, integration and verification. You may need to complete login or consent.

<details>
<summary>Manual setup</summary>

Node **22.13+**, ESM. React integrations support **18 and 19**. The headless controller and server client do not require React.

Download the package and checksum from [release v0.3.1](https://github.com/cloneisyou/clone-sdk/releases/tag/v0.3.1), then verify and install:

```sh
cd vendor/clone-sdk
shasum -a 256 -c clone-ai-tab-completion-0.3.1.tgz.sha256
cd ../..
npm install ./vendor/clone-sdk/clone-ai-tab-completion-0.3.1.tgz
```

Use your project's package manager and commit its lockfile. **The package is not on npm.** See [release downloads](docs/releases.md#download-and-install) for download commands. Hosted API access requires a separate app key.

```tsx
'use client';
import { useState } from 'react';
import { createPredictionTransport } from '@clone-ai/tab-completion';
import { TabCompletionInput } from '@clone-ai/tab-completion/react';

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

Implement `/api/clone/predict` in your authenticated backend using `CloneClient` from `@clone-ai/tab-completion/server`. Derive the user ID from the server session. Keep the app key on the server, never in browser code or `VITE_*` / `NEXT_PUBLIC_*` variables. Pass your real conversation and advance `context_revision` when it changes.

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

## Choose an entry point

| Import | Use it for |
| --- | --- |
| `@clone-ai/tab-completion` | Controller, browser transport, errors and public types |
| `@clone-ai/tab-completion/react` | `useTabCompletion` or `TabCompletionInput` |
| `@clone-ai/tab-completion/assistant-ui` | `CloneComposerInput` inside an existing assistant-ui composer |
| `@clone-ai/tab-completion/server` | `CloneClient` and optional PKCE connection flow |

The React input uses a native textarea. Rich-text editors need an insertion and Undo adapter around the controller. The assistant-ui adapter targets `@assistant-ui/react@0.15.21` and uses its `unstable_useComposerInput` hook; verify compatibility before upgrading it.

## Develop

```sh
pnpm check
pnpm exec playwright install chromium
pnpm test:browser
pnpm test:package
```

Package tests install the actual archive into React 18 and 19 consumers and verify build, Tab insertion, Undo, explicit send and context changes. These checks do not establish suggestion quality, native OS IME behavior or acceptance in your application.

See [Contributing](CONTRIBUTING.md) for the repository layout and validation commands, [context mapping](docs/context-mapping.md) for request design, and [Releases](docs/releases.md) for distribution.

[Security](SECURITY.md) · [Changelog](CHANGELOG.md) · [MIT license](LICENSE)

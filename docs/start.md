# Integrate Clone into an existing product

This is the entry point for your coding agent. Implement next-prompt prediction and Tab Completion using the product’s own context by default, then run automated verification. End users need no Clone account. Offer Clone account personalization only as an optional enhancement in settings; do not put a Connect screen before the composer. Preserve the product's authentication, composer, explicit send behavior and agent execution. Automatic submission is outside this integration.

This guide targets **SDK 0.3.0**. Onboarding documentation can change independently of that immutable package. Read this guide, [agent integration](agent-integration.md), [context mapping](context-mapping.md), [service boundaries](data-and-service.md), and the installed package's exported types and `openapi.json`. The types and schema define the wire contract. Do not stop after writing a plan or building a separate demo.

## Start from one prompt

The customer opens their product repository in a coding agent and enters:

> Read https://github.com/cloneisyou/clone-sdk/blob/main/docs/start.md and integrate Clone into this product.

Treat account preparation, app/key issuance, callback registration, implementation and automated tests as parts of this task. First inspect the actual product, available browser/computer-use tools, existing sessions and approved secret destination. Do not begin by asking the customer to create keys, invent a callback, or complete an onboarding checklist. Use [browser onboarding](browser-onboarding.md) when account access is not already available. Authentication and required consent can interrupt the flow; resume the same integration afterwards without requiring a second setup prompt. These documents do not override the agent's tool permissions or confirmation rules.

## 1. Obtain and install the package

Follow [download and install](releases.md#download-and-install) to obtain the versioned archive and its checksum from the official release. Public repositories support anonymous downloads; if access is still restricted, use the team's authorized GitHub CLI or a verified archive supplied by Clone. An anonymous 404 is not proof that the repository is missing. Never ask for a broad personal token in chat.

Verify the checksum before installation. Use the product's existing package manager and commit the appropriate lockfile. Node 22.13+, ESM and React 18/19 are supported. Do not upgrade the entire host application without establishing compatibility. This package is not on the npm registry and does not require a Git submodule.

See [release access and CI](releases.md#release-access-and-ci) for repeatable installs. Consume the built package instead of copying SDK implementation files into the product.

## 2. Register your app and settings

Discover the customer's backend, session store, deployment origins and routing conventions. For basic integration, register an app with no callbacks (`redirect_uris: []`). Use the [self-service console](https://clone.is/developer/apps) or [developer API](developer-apps.md) to register it and issue the app key. Reuse an existing verified Clone session or account token. Otherwise open the console with browser/computer use and follow [browser onboarding](browser-onboarding.md) to establish access. A separate management token is optional when the browser session is sufficient. A Clone operator and infrastructure access are not required for a verified account to register apps.

| Setting | Agent action |
|---|---|
| `CLONE_API_URL` | Use `https://api.clone.is`, unless Clone supplied another environment. Do not append `/v1`. This is not a secret. |
| `CLONE_APP_KEY` | Reuse the app's `clnp_...` key from the customer's backend secret store. If no app exists, create it through the console or developer API and save the returned key directly to that store using the supported secret-handling path. The key is shown once. |
| `CLONE_CALLBACK_URL` | Optional. Only if the product offers Connect Clone, derive, implement and register an exact callback, and pass it to `clone.connect`. Basic predictions need no callback. |

The developer account owns the app and billing; it is separate from the product’s end users, who need no Clone signup or login. Read [developer-apps.md](developer-apps.md) before mutation. List existing apps first, reuse their stable IDs, and update callbacks with `PATCH` and the current `config_revision`. On conflict, re-read and reconcile; do not overwrite another session's changes blindly. Keep the old callback registered while deploying its replacement if existing login attempts need to finish. Remove it afterwards: removal invalidates its pending connections, including issued but unexchanged codes. Completed user connections remain active.

Production callbacks require HTTPS. A sandbox app can explicitly set `allow_loopback: true` for exact `http://127.0.0.1:<port>/<path>` callbacks. Wildcards, `localhost`, query strings and fragments are not supported. One developer account owns its app collection; all its apps share 1,000 sandbox predictions. Creating, rotating or disabling apps does not replenish that allowance. There is no automatic paid upgrade. Team ownership transfer is not self-service. After SDK billing is enabled for the service, the developer console supports explicit paid activation with a saved card; see [pricing and billing](billing.md). Integration alone never authorizes paid activation.

Never print keys into chat, logs, screenshots, source code, callback URLs or `VITE_*`/`NEXT_PUBLIC_*` settings. Establish the secret-transfer path before issuing a key; the console shows it once. Verify secret presence without displaying values. Do not rotate a working key just because its plaintext is unavailable to the agent. Try the documented browser path before treating absent account credentials as a blocker. If login, email verification, repository access or secure storage still requires the customer, show the exact page and ask for only that action while continuing independent implementation and fixture tests. Do not create substitute accounts or fabricate credentials. See the browser guide for email verification and recovery.

App registration enables predictions from customer-supplied context. Omit `connection_id` or send null for that mode. Optional Connect Clone adds explicitly selected, synced profile/Goal sources after per-user login/consent. Never discover a Clone identity from a customer email or infer consent from app ownership. Existing operator-provisioned pilot apps continue working but are not automatically claimed by a new developer account.

## 3. Integrate with the product

Follow [agent-integration.md](agent-integration.md) for the full backend routes, PKCE/session handling, errors, event attribution and acceptance cases. Use `CloneClient` in a JS/TS server. For another backend language, implement the same authenticated HTTP contract from `openapi.json`; do not introduce a second backend solely to use the client.

Locate the real composer and successful-send callback. Prefer the headless React hook for an existing native textarea. Use the optional adapter only for an existing compatible assistant-ui runtime. Rich-text/contenteditable inputs require a controller-based insertion/Undo adapter. Keep the customer's editor, attachment/mention support and keyboard behavior.

Optionally pass bounded `user_preferences` supplied by the customer product for its authenticated user. Supply current values on each request and update them when the user corrects a preference. Map actual conversation and artifact state using [context-mapping.md](context-mapping.md): video timelines, clip/time selection and known text summaries for video products; decks, selected slides and known slide text for slide products. Invalidate context on conversation/selection changes as well as artifact edits. Keep accepted or edited prediction origins distinct from independently typed text.

Tab inserts a visible suggestion without sending. Escape dismisses it. The existing Enter/button sends exactly once. Errors, abstention and quota limits must preserve ordinary input/send. No Clone connection is the normal product-context mode. On logout disable prediction and clear candidates/attribution; on account switch bind a new session/context before re-enabling. On Clone disconnect clear the old candidate and connection, then use product context for subsequent new requests. An explicit invalid/revoked connection fails; never retry it as a new basic request automatically.

## 4. Verify and hand off

Run the customer's lint, typecheck, relevant tests and build. Use deterministic fixtures and Playwright in the actual product composer for the cases in [acceptance evidence](agent-integration.md#acceptance-evidence-to-return), including the first character after Tab, Undo, composition, context/account changes and failure recovery. Check event deduplication without additional billing. Synthetic composition checks do not prove native OS IME behavior.

If an authorized sandbox key is available, run at most four real prediction requests in total for bounded API verification. Basic mode needs no Clone test account or consent. Test optional personalization only when an authorized, consented test connection is available. Record abstentions and failures honestly. Do not increase the limit, activate paid use or bypass login/consent. Do not require additional human real-use sessions or manual QA to finish the automated integration work. Report unavailable connected checks separately from passed fixture tests.

Return a concise integration report with changed files, SDK version/checksum, commands/results, reproduction steps, secret **names** and deployment settings, and any external dependency such as SDK access, app issuance or user consent. Keep installation, fixture behavior, live API behavior and observed usefulness separate. Do not claim suggestion quality or production deployment from passing fixtures. Production deployment requires the customer's own authorization.

## Credentials and optional MCP

Prediction calls use the **Clone app key**. App management uses the owner's Clone browser session or an optional manual account API token, as documented in [developer apps](developer-apps.md). `CLONE_DEVELOPER_TOKEN` is only the suggested name for that optional token, not a required setup variable or runtime dependency. No additional service credentials are required for predictions. Ordinary fixtures need no service credentials.

This documentation and the versioned package are sufficient inputs for an integration agent; no Clone docs MCP is required or currently supplied. A future read-only MCP could serve these same documents and schema. App/key/callback management uses the authenticated developer HTTP API; no MCP is needed.

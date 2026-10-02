# Integrate Clone SDK into an existing product

This is the entry point for your coding agent. Implement next-prompt prediction and Tab Completion using the product’s own context by default, then run automated verification. End users need no Clone account. Offer Clone account personalization only as an optional enhancement in settings; do not put a Connect screen before the composer. Preserve the product's authentication, composer, explicit send behavior and agent execution. Automatic submission is a separate, optional Clone mode with explicit end-user start and bounded scope.

This guide targets **SDK 0.6.3**. Version 0.3.1 lacks the presentation, deadline and Clone mode options; inspect the installed version before using them. Onboarding documentation can change independently of that immutable package. Read this guide, [agent integration](agent-integration.md), [context mapping](context-mapping.md), [service boundaries](data-and-service.md), and the installed package's exported types and `openapi.json`. The types and schema define the wire contract. Do not stop after writing a plan or building a separate demo.

## Start from one prompt

The customer opens their product repository in a coding agent and enters:

> Read https://github.com/cloneisyou/clone-sdk/blob/main/docs/start.md and integrate Clone SDK into this product.

Treat account preparation, app/key issuance, callback registration, implementation and automated tests as parts of this task. First inspect the actual product, available browser/computer-use tools, existing sessions and approved secret destination. Do not begin by asking the customer to create keys, invent a callback, or complete an onboarding checklist. Use [browser onboarding](browser-onboarding.md) when account access is not already available. Authentication and required consent can interrupt the flow; resume the same integration afterwards without requiring a second setup prompt. These documents do not override the agent's tool permissions or confirmation rules.

## Choose the customer experience

After inspecting the existing composer, use the agent's AskUserQuestion or equivalent question tool to confirm the product choices that cannot be inferred from the customer's request. Bundle these into one short interaction; reuse choices already supplied, and continue independent implementation while waiting. Explain the supported defaults and record the answers in the integration report.

| Choice | Supported default and alternatives |
|---|---|
| When to suggest | Both empty-composer next prompts and completion of an existing draft. If the customer wants only one, gate the hook/controller with `enabled` according to the current draft. |
| How to present | Ask for **instant ghost text (default)** or **typewriter animation**. Map the choice to `presentation: "instant"` or `"typewriter"`. Both use a complete JSON response, not API token streaming. Follow the [rendering contract](agent-integration.md#suggestion-rendering-contract). |
| Context and personalization | Product conversation/artifact context by default. Ask whether optional Connect Clone belongs in settings, and which product-owned preferences may be supplied. Clone personalization requires each user's explicit consent to selected sources. |
| Automatic sending (Clone mode) | Ask whether to offer optional Clone mode. Default off. If requested, ask for the send/time limits and use `useCloneMode` or `CloneModeController` with explicit end-user Start, visible preview/Stop, and real host completion signals. Default 3 sends / 5 minutes. Never enable on mount, restore, or Tab. See [Clone mode](clone-mode.md). |
| Rollout and spending | Use production integration by default; reuse an explicit evaluation choice. For production, include company card setup and explicit PAYG consent in initial onboarding before enabling production predictions. Keep card-free sandbox evaluation as a separate path. Ask about an end-user suggestion switch and rollout cohort. Budget alerts and a hard limit are separate choices; never activate paid use or a hard stop silently. |

Do not ask customers to choose details the agent can discover, such as the framework, session store or callback route. Existing send behavior, Undo, IME safety and graceful failure are mandatory integration requirements rather than optional preferences.

## 1. Register your app and settings

Discover the customer's backend, session store, deployment origins and routing conventions. For basic integration, register an app with no callbacks (`redirect_uris: []`). Use the [production setup console](https://clone.is/developer/apps?setup=production) or [developer API](developer-apps.md) to register it and issue the app key. Reuse an existing verified Clone session or account token. Otherwise open the console with browser/computer use and follow [browser onboarding](browser-onboarding.md) to establish access. A separate management token is optional when the browser session is sufficient. A Clone operator and infrastructure access are not required for a verified account to register apps.

| Setting | Agent action |
|---|---|
| `CLONE_API_URL` | Use `https://api.clone.is`, unless Clone supplied another environment. Do not append `/v1`. This is not a secret. |
| `CLONE_APP_KEY` | Reuse the app's `clnp_...` key from the customer's backend secret store. If no app exists, create it through the console or developer API and save the returned key directly to that store using the supported secret-handling path. The key is shown once. |
| `CLONE_CALLBACK_URL` | Optional. Only if the product offers Connect Clone, derive, implement and register an exact callback, and pass it to `clone.connect`. Basic predictions need no callback. |

The developer account owns the app and billing; it is separate from the product’s end users, who need no Clone signup or login. Read [developer-apps.md](developer-apps.md) before mutation. List existing apps first, reuse their stable IDs, and update callbacks with `PATCH` and the current `config_revision`. On conflict, re-read and reconcile; do not overwrite another session's changes blindly. Keep the old callback registered while deploying its replacement if existing login attempts need to finish. Remove it afterwards: removal invalidates its pending connections, including issued but unexchanged codes. Completed user connections remain active.

Production callbacks require HTTPS. A sandbox app can explicitly set `allow_loopback: true` for exact `http://127.0.0.1:<port>/<path>` callbacks. Wildcards, `localhost`, query strings and fragments are not supported. One developer account owns its app collection; all its apps share 1,000 sandbox predictions. Creating, rotating or disabling apps does not replenish that allowance. There is no automatic paid upgrade. Team ownership transfer is not self-service. After SDK billing is enabled for the service, the developer console supports explicit paid activation with a saved card; see [pricing and billing](billing.md). Integration alone never authorizes paid activation.

Never print keys into chat, logs, screenshots, source code, callback URLs or `VITE_*`/`NEXT_PUBLIC_*` settings. Establish the secret-transfer path before issuing a key; the console shows it once. Verify secret presence without displaying values. Do not rotate a working key just because its plaintext is unavailable to the agent. Try the documented browser path before treating absent account credentials as a blocker. If login, email verification, repository access or secure storage still requires the customer, show the exact page and ask for only that action while continuing independent implementation and fixture tests. Do not create substitute accounts or fabricate credentials. See the browser guide for email verification and recovery.

App registration enables predictions from customer-supplied context. Omit `connection_id` or send null for that mode. Optional Connect Clone adds explicitly selected, synced profile/Goal sources after per-user login/consent. Never discover a Clone identity from a customer email or infer consent from app ownership. Existing operator-provisioned pilot apps continue working but are not automatically claimed by a new developer account.

### Complete company card setup before production installation

Production integration is the default path: company account → app registration → pricing and card → SDK installation → verification. Use the separate **Try the free sandbox** path at `/developer/apps?setup=sandbox` only when the customer chooses evaluation. Do not silently fall back to sandbox if production card setup is canceled or unavailable.

A newly registered app initially remains sandbox. Save its one-time key directly to the approved backend secret store before leaving the console for Stripe, then choose **I saved the key**. The console opens pricing and card setup for that same app. The customer must personally review the displayed unit price, authorize PAYG, and register the card on Stripe. Explain: **No charge when you register your card. Actual usage is billed monthly.** Reuse an existing company card through **Enable PAYG for this app**, with the customer's explicit consent, instead of creating another company or asking for another card.

After the customer returns, the console calls billing sync and reads the app's authoritative billing state. Continue production installation only after the app is active with `plan: "paid"` and `payg: true` under an active company mandate. A success URL, card thumbnail, or `/sync` response alone is not proof. See [billing](billing.md) for readback and recovery. On cancel, pending setup, or processor failure, keep the same app and reconcile with **Refresh billing**. If setup is still incomplete, return through **Add company card and enable PAYG**; do not issue a new app/key or activate paid usage yourself. Inspection and preparation can continue while the customer completes the handoff.

For the explicitly chosen sandbox path, save the key and continue without a card. Re-read that the app is actually sandbox; never describe an already-paid app as free merely because the URL contains `setup=sandbox`.

## 2. Obtain and install the package

Install the public npm package using the product's existing package manager:

```sh
npm install --save-exact @clone-ai/tab-completion@0.6.3
```

Commit the appropriate lockfile. Node 22.13+, ESM and React 18/19 are supported. Do not upgrade the entire host application without establishing compatibility. A Git submodule is not required.

For a checksum-verified GitHub archive, follow [download and install](releases.md#download-and-install). Consume the built package instead of copying SDK implementation files into the product. See [release access and CI](releases.md#release-access-and-ci) for repeatable installs.

## 3. Integrate with the product

Follow [agent-integration.md](agent-integration.md) for the full backend routes, PKCE/session handling, errors, event attribution and acceptance cases. Use `CloneClient` in a JS/TS server. For another backend language, implement the same authenticated HTTP contract from `openapi.json`; do not introduce a second backend solely to use the client.

Locate the real composer and successful-send callback. Prefer the headless React hook for an existing native textarea. Use the optional adapter only for an existing compatible assistant-ui runtime. Rich-text/contenteditable inputs require a controller-based insertion/Undo adapter. Keep the customer's editor, attachment/mention support and keyboard behavior.

Optionally pass bounded `user_preferences` supplied by the customer product for its authenticated user. Supply current values on each request and update them when the user corrects a preference. Map actual conversation and artifact state using [context-mapping.md](context-mapping.md): video timelines, clip/time selection and known text summaries for video products; decks, selected slides and known slide text for slide products. Invalidate context on conversation/selection changes as well as artifact edits. Keep accepted or edited prediction origins distinct from independently typed text.

Tab inserts a visible suggestion without sending. Escape dismisses it. The existing Enter/button sends exactly once. Errors, abstention and quota limits must preserve ordinary input/send. No Clone connection is the normal product-context mode. On logout disable prediction and clear candidates/attribution; on account switch bind a new session/context before re-enabling. On Clone disconnect clear the old candidate and connection, then use product context for subsequent new requests. An explicit invalid/revoked connection fails; never retry it as a new basic request automatically.

## 4. Verify and hand off

Run the customer's lint, typecheck, relevant tests and build. Use deterministic fixtures and Playwright in the actual product composer for the cases in [acceptance evidence](agent-integration.md#acceptance-evidence-to-return), including the first character after Tab, Undo, composition, context/account changes and failure recovery. Check event deduplication without additional billing. Synthetic composition checks do not prove native OS IME behavior.

Once the chosen path is ready and its key is authorized, run at most four real prediction requests in total for bounded API verification. Sandbox requests use its shared allowance. Production verification requires the customer's explicit PAYG consent and adds usage charges: at $0.02 per valid suggestion, four suggestions cost at most $0.08. Basic mode needs no Clone test account or consent. Test optional personalization only when an authorized, consented test connection is available. Record abstentions and failures honestly. Do not increase the limit, activate paid use on the customer's behalf, or bypass login/consent. Do not require additional human real-use sessions or manual QA to finish the automated integration work. Report unavailable connected checks separately from passed fixture tests.

Return a concise integration report with changed files, SDK version/checksum, commands/results, reproduction steps, secret **names** and deployment settings, and any external dependency such as SDK access, app issuance or user consent. Keep installation, fixture behavior, live API behavior and observed usefulness separate. Do not claim suggestion quality or production deployment from passing fixtures. Production deployment requires the customer's own authorization.

## Credentials and optional MCP

Prediction calls use the **Clone app key**. App management uses the owner's Clone browser session or an optional manual account API token, as documented in [developer apps](developer-apps.md). `CLONE_DEVELOPER_TOKEN` is only the suggested name for that optional token, not a required setup variable or runtime dependency. No additional service credentials are required for predictions. Ordinary fixtures need no service credentials.

This documentation and the versioned package are sufficient inputs for an integration agent; no Clone docs MCP is required or currently supplied. A future read-only MCP could serve these same documents and schema. App/key/callback management uses the authenticated developer HTTP API; no MCP is needed.

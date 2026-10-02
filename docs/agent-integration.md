# Instructions for the customer's integration agent

Implement next-prompt prediction and Tab Completion in the existing customer composer using product context by default, preserving its submission behavior. No Clone end-user account, consent screen or callback is required for this basic path. Offer Clone personalization separately in settings only if desired. Read `README.md`, exported types and `openapi.json`. Do not infer that the customer uses assistant-ui just because the optional adapter exists.

Begin with [start.md](start.md), which covers agent-led self-service app registration and callback updates. This guide supplies the detailed implementation contract for SDK 0.6.3. Verify installed types; 0.3.1 has no typewriter option or Clone mode.

## Prerequisites

- The public `@clone-ai/tab-completion@0.6.3` npm package, Node 22.13+, React 18 or 19. Follow the [installation instructions](releases.md#download-and-install). Checksum-verified GitHub archives are also available.
- A Clone app key (`clnp_...`) for the chosen production or sandbox app and its API base URL. Use an isolated sandbox app for synthetic integration tests. Only optional personalization needs an exact registered HTTPS callback (HTTP loopback is local/test only). The agent obtains these through self-service onboarding; the customer need not prepare them in advance.
- An existing authenticated customer session and server-side session storage.
- Only for optional personalization: a Clone test account with selected profile/Goal context already synced. Basic verification needs no Clone test account. Local-only unsynced content is unavailable.
- When credentials or the customer's auth/session interface are missing, identify that dependency; do not fabricate them or claim a connected test passed.

The app key is required for API verification; a callback and Clone account are required only for optional personalized verification. Missing credentials do not prevent inspection, preparation or deterministic tests. Production installation follows verified company card setup; an explicitly selected sandbox does not require a card. If account access is absent, use [browser/computer-use onboarding](browser-onboarding.md) and request only an authentication or required-consent handoff when needed. If offering personalization, derive and register the callback using the [self-service onboarding procedure](start.md#1-register-your-app-and-settings). The hosted API origin is `https://api.clone.is` unless Clone specifies another environment. No additional service credentials are required for predictions.

## Server integration

Import `CloneClient` and `ConnectionFlow` from `@clone-ai/tab-completion/server`. Create the client once in a server-only module:

```ts
const clone = new CloneClient({ apiKey: process.env.CLONE_APP_KEY!, baseUrl: process.env.CLONE_API_URL! });
```

Implement the basic routes in your existing authenticated backend. Check your normal CSRF/origin requirements on mutations. Limit body size to 300 KB. Never log request bodies, app keys or completion text. Derive `userId` from the customer's authenticated server session, never from browser input. The app key isolates the customer app; the server identity isolates its users.

| Customer route | Implementation |
|---|---|
| POST `/api/clone/predict` | Read typed `CompletionRequest`, call `clone.predict(session.user.id, body, {signal})`. With no optional personalization configured, require `connection_id` to be absent/null. Preserve status and safe `{detail:{code}}` errors. Forward disconnect cancellation. |
| POST `/api/clone/events` | Read `{event_id, request_id, kind}` and call `clone.recordEvent(session.user.id, body)`. Preserve the same event ID on retries. Do not include message text. Events do not change billing and do not require a Clone connection. |

Basic requests omit `connection_id` or set it to null. Supply recent `messages`, selected `artifact` text and, optionally, up to 4,000 characters of `user_preferences` from the product's own permitted data for this user. Update `context_revision` on preference changes. Basic predictions use the context in that request and do not require a Clone end-user account. Its response has `connection_id: null`, `profile_revision: ""`, and `grant_revision: 0`.

### Optional Clone personalization

Add the following routes only when offering Connect Clone. Place it in optional settings, not in front of the composer. Store connection and flow by the **current authenticated user**, never process-globally.

| Customer route | Implementation |
|---|---|
| POST `/api/clone/connect` | `clone.connect(session.user.id, registeredCallbackUrl)`. Keep the returned `flow` in the server session for ten minutes; send only `authorizeUrl` to the browser. |
| GET your callback | Load and atomically consume the unexpired `flow` from the same session, call `clone.exchange(flow, new URL(request.url).searchParams, session.user.id)`, and persist `connection_id` by user. Reject reused flow; redirect to a clean URL. Set `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. |
| GET `/api/clone/state` | Return only this user's saved optional connection ID or null. |
| POST `/api/clone/disconnect` | Clear the client candidate immediately, revoke this user's saved connection through `clone.revoke`, and remove it from server storage after success. New requests can then use product context. Resolve an uncertain revoke with current state before reporting successful disconnection. |

For prediction, match any supplied connection ID to the server session's saved connection before forwarding. Never accept another user's connection from the browser. A request with an explicitly invalid, expired, revoked or stale connection must fail rather than silently switch to basic mode. Clear the unusable connection/candidate; the host can enter basic mode for subsequent newly initiated requests. Do not automatically retry failed personalized work without its connection, create a second billed request, or reuse a request ID across modes.

`CloneClient` overwrites any body `user_id` with the server identity. It does not implement your authentication, CSRF checks, connection storage or session expiry. `ConnectionFlow` contains a PKCE verifier and must stay server-side. Do not embed it in a URL or browser localStorage. See `examples/react/vite.config.ts` in the source bundle for an executable **loopback fixture** backend; its fixed identity and in-memory storage are intentionally unsuitable for production.

Next.js App Router: import the server client only in Route Handlers/server modules; keep the React wrapper in a file beginning `'use client'`. Vite: use the existing server or framework middleware; Vite alone is not an authenticated production backend. Do not move the key into client configuration to get a demo working.

## React integration

Prefer `useTabCompletion({value,onValueChange,context,transport})` if preserving the existing textarea. Attach all `inputProps`, including its ref and composition/select handlers, to the **same native textarea**. Compose host keyboard handlers after the SDK handler, and stop when `event.defaultPrevented`. Render `completion` through your existing ghost-text affordance. For a new textarea use `TabCompletionInput`, which supplies the overlay and accessible description.

For assistant-ui 0.15.21, replace only `ComposerPrimitive.Input` with `CloneComposerInput` from `/assistant-ui` under your existing `ComposerPrimitive.Root` and runtime. Keep `ComposerPrimitive.Send`. Tab never sends; the adapter supports explicit Enter and Shift+Enter newline. Custom Enter behavior can call `preventDefault` in its `onKeyDown` prop. The adapter does not provide assistant-ui mention/upload plugins or autosizing; keep a custom composer through the headless adapter if those are required.

Use `createPredictionTransport('/api/clone/predict')` from the root entry. It uses same-origin credentials and `AbortSignal`; it never retries silently. Keep `session_id` stable for one customer thread. Increment `context_revision` whenever messages, artifact selection/revision, mode or relevant preferences change. Update `connection_id` on account switch/reconnect and clear it on logout/revoke. Draft revisions are maintained by the React hook.

Pass the actual conversation through `context.messages`, including the latest explicitly submitted text and real assistant responses. The example keeps the latest 30 turns and increments the conversation revision on submission, independently of the artifact revision. `ComposerEvents.submitted(text)` returns the submission origin (`human`, `accepted_prediction` or `edited_prediction`) for that message. Preserve the latest correction within the API envelope; do not invent an assistant response or relabel accepted generated text as human-authored. An empty composer immediately after a user sends a message may legitimately receive no suggestion while the host agent is still working.

Debounce defaults to 350 ms; one active client request; default maximum 20 attempts/minute per controller. Eligibility: focused, writable textarea, caret at the end, no selection, no active IME. Tab accepts; Escape dismisses and stops propagation; without a candidate Tab retains normal focus traversal. Stale/aborted/mismatched/expired results are ignored. No Clone connection means product-context prediction remains available. Set `enabled={false}` on host logout; change the session identity/context on host account switches before re-enabling. Omitted connection IDs no longer disable prediction in 0.2.1. Native insertion preserves Chromium Undo; verify the host/browser combination before claiming support.

## Optional automatic sending

Ask whether the customer wants to expose Clone mode separately from manual Tab completion. Use the [Clone mode contract](clone-mode.md), keep it off by default, and show the end user the scope, turn/time limits, full candidate and Stop control. Start only on an explicit user action. Supply the normal authenticated host send callback, bind account/thread/connection identity, stop on typing/IME/hide/logout/context change/error, and call `turnCompleted()` only after the host agent completes and new context is supplied. Submitted messages use `origin: "agent"`, never human acceptance. Unknown send outcomes are not retried. The executable local example is `?clone-mode=1`.

## Observation events

Wire `onEvent` for `presented`, `accepted` and `dismissed`. The host records `edited` only after the user changes an accepted draft, and `submitted` only from its existing successful submission callback. Never send a message to obtain telemetry. The executable example includes `examples/react/composer-events.ts`: observe the pre-insertion value when `accepted` arrives, feed native input changes (and controlled `onValueChange`) to the tracker, and call `submitted(text)` once the host accepts an explicit send. Reset attribution on account, connection, thread or artifact-context changes. The assistant-ui example uses the same input observer and its runtime `onNew` callback.

Use the bubbling `onInput` observer shown in the example. Updating observation state in `onInputCapture` can restore a controlled textarea's old value before its `onChange` handler receives the edit. Test the exact text after the first character typed following Tab, including a space or punctuation, and verify that submitted text reaches the next prediction request.

The example distinguishes the SDK insertion from a later edit, removes attribution after clearing or Undo back to the original draft, and associates a submission with the most recently accepted suggestion. It does not measure how much suggested text remains or every suggestion used in a draft. `presented` means the controller offered a candidate; it does not prove the user read it. Adapt these observation boundaries explicitly if your editor behaves differently. No draft or completion text is included in the transmitted `{event_id, request_id, kind}`.

Telemetry is best effort and must not block input or send. The example shows local `pending`/`recorded`/`failed` delivery receipts; fixture receipts are labelled separately. SDK 0.6.3 uses bounded retries with the same event ID/body; it does not persist a durable retry queue. Reset the tracker on account/context changes to abort old-scope delivery. Report failed/missing deliveries instead of treating them as zero engagement. Verify acceptance without send, edited submission, Undo followed by an unrelated manual send, context change, telemetry failure, duplicate delivery, and unchanged billable usage. These event records alone do not establish coverage, usefulness, suggestion quality or human acceptance.

## Suggestion rendering contract

The prediction endpoint returns one complete JSON object, not SSE or token deltas. `createPredictionTransport` waits for that response, the controller validates it, and the controller validates the complete candidate. By default `useTabCompletion` exposes the full `completion` immediately and `TabCompletionInput` renders it as ghost text. With `presentation: "typewriter"`, the hook exposes a visible prefix until the animation completes; `canAccept` remains false until then. The complete candidate remains in `state.candidate`. This is the default for both empty-composer next prompts and draft completions.

Do not add per-character timers, progressively slice `completion`, or route it through an assistant-message streaming renderer by default. A typewriter animation is an optional presentation choice, not evidence that the API streams. In 0.6.3 set `presentation: "typewriter"` only when the customer's stated preference or an AskUserQuestion answer calls for it; do not ask again for a choice already supplied. The entire candidate must be visible before offering Tab acceptance; never accept only a partial string or send unseen text. Cancel any animation on edits, selection/context changes, dismissal, or expiry. Ordinary manual sending must stay available throughout.

Verify the installed package version and lockfile, inspect the actual composer adapter, and check the response format before attributing progressive display to the SDK or customer code. A recording alone cannot establish which layer produced an effect. Return evidence that the default renderer shows a complete candidate, Tab inserts it exactly once without sending, and only the host's explicit-send action submits it.

## Errors and retry

### Keep the host composer independent of Clone availability

Prediction is optional background work. Never await it in the host's input, attachment, Undo, Enter or send-button path, and never disable the composer while it is loading or unavailable. On Clone network failure, HTTP error, invalid response or abstention, show no candidate and retain the current draft, selection, attachments and normal explicit-send behavior. Keep infrastructure errors in developer diagnostics, not in a blocking end-user dialog.

Do not gate composer mounting, page loading, or the host's send endpoint on Clone health. Keep prediction requests separate from the customer's core send/agent path and bound their backend concurrency so stalled prediction calls cannot exhaust shared request capacity. A Clone outage disables the enhancement; it must not disable the product's composer. This integration contract must be tested in the customer's actual app, not inferred from the SDK demo.

The controller and server client default to a 15-second prediction deadline (`requestTimeoutMs`, at most 30 seconds). Reuse one server `CloneClient` with `maxConcurrentRequests` (default 16) to bound local in-flight calls. Apply suitable host request-body limits, propagate disconnect cancellation, and retain the SDK's stale-result checks. A request that never resolves must still leave typing, editing, focus traversal and sending usable. Recovery must not submit a draft or accept an old candidate. Avoid automatic retry loops and never generate a new paid request merely to hide an unknown transport outcome.

Verify this in the actual host composer by returning 503, 429 and 402 from the Clone proxy, failing its network request, returning malformed JSON, and leaving a request pending. For each case: type and edit text, confirm no stale ghost text, verify candidate-free Tab moves focus, and send the exact draft once through the existing Enter/button flow. Check Undo and IME independently. Restore the prediction route and verify a fresh suggestion can be accepted without sending. These local failure cases do not prove production capacity or a live customer outage test.

| Code / status | Action |
|---|---|
| `prediction_in_progress` / 409 | Same ID is in flight; retry the exact body later, never duplicate generation. |
| `idempotency_conflict` / 409 | Bug: same request ID with different body/user. Fix identity/revision mapping. |
| `prediction_replay_expired` / 410 | Result recovery window ended. Do not automatically generate a new paid request. |
| `connection_revoked`, `connection_not_found` / 403 or 404 | Clear the invalid connection/candidate. Resume product-context mode for subsequent user activity; keep reconnect optional. |
| `context_changed_reconnect` / 409 | Clear the stale personalized candidate. Use product context for subsequent user activity or let the user reconnect and review changed sources. |
| `sandbox_exhausted`, `monthly_cap_reached` / 402 | Disable predictions, keep normal typing/send; customer must explicitly change plan/cap. |
| `rate_limited` / 429 | Back off; keep normal input. |
| `context_too_large`, `latest_message_too_large` / 413 | Reduce artifact summary/selected context; never silently erase latest human correction. |
| service 502/503/504 | Hide candidate and keep typing. Retry same ID to resolve unknown settlement; terminal failed ID never executes again. |
| `invalid_response` / 502 | The SDK could not decode an object-shaped JSON response. Keep normal input and inspect the backend; do not retry with a new ID automatically. |

New IDs mean new possible billable work. Retry with the same ID/body if the transport outcome is unknown. Results can be recovered for one hour but accepted for only 60 seconds. Avoid client retry loops on terminal errors. Send errors from Clone through your backend unchanged; network errors should not block your composer.

## Acceptance evidence to return

Use Playwright in the customer's app. Save commit/version, commands, screenshots and network receipts with secrets/text redacted. Cover both nonempty draft and empty next-prompt. Assert displayed suggestion → Tab inserts exactly once → send count unchanged → user's Enter/button sends exactly once. Verify Undo, Escape, candidate-free Tab focus, repeated Tab, Shift+Tab, selection, composition start/end, late response, typing during request, thread/artifact change, logout/reconnect, 402/429/service failure. Browser-dispatched composition events are contract tests, not native OS IME evidence. Do not require additional human real-use sessions or manual QA to finish automated integration. Mark native behavior as unverified if there is no existing evidence for that host/browser.

First verify basic mode without any Clone user session, callback or connection: both draft completion and empty next-prompt must work, events must be attributed only to the authenticated customer user, and quota/cancellation must apply normally. Then, if optional personalization is implemented, verify switching in both directions clears candidates and drops late responses; an explicitly bad connection must fail without an implicit fallback request. Verify connected scope: approved synced profile/Goal only; no unrelated source included; wrong app/user connection rejected; revoke during generation produces no candidate. API tests cover these boundaries, but customer code must also clear local state on account changes. Revocation blocks future/in-flight/replayed server results; an already delivered candidate can exist until the host clears it or its 60-second expiry.

Report installation, fixture interaction, live API call, real customer app, human acceptance and usefulness **separately**. Missing app credentials or service access is an explicit unverified item, not a passing mock. Return observed latency, API usage and charges, including failed/cancelled attempts where receipts exist, and missing-cost count. Do not claim customer adoption, superiority or savings from fixture success.

## Feedback memory

Use the packaged [FeedbackTracker](feedback.md) for host attribution and bounded delivery. Only opt-in edited successful submissions and explicit evaluations enter scoped API memory; ordinary observations do not automatically train preferences.

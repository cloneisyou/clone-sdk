# 0.8.0 and Python 0.3.0

- Add original video/audio artifact transport, source-bound structured review reports and local audio preparation. Four video frames remain previews. Matching server deployment and an OpenAI credential are required.
- Use a 180-second default budget for image and native media predictions; preserve normal text-request deadlines and cancellation behavior.

# 0.7.1

- Publish current npm and PyPI install instructions with Python client 0.2.1 and the public SDK quickstart as the npm homepage.
- Document hosted PAYG availability and distinguish content-free behavior receipts from explicitly opted-in feedback text. Runtime behavior is unchanged.

# 0.7.0

- Publish the JavaScript SDK as `@clone-ai/prompt-prediction`. Update imports, generated integration examples, archive names, npm verification and installation guides. Runtime exports and prediction behavior remain unchanged.

# 0.6.4

- Include public npm installation instructions in the distributed README and integration guides. Keep exact package versions and checksum-verified archive alternatives aligned, and point billing guidance to the API pricing page.
- Allow a verified npm release to be published directly as `latest` or `next` through the configured trusted publisher. Preview publication remains the default.

# 0.6.3

- Keep pilot metrics and feedback events attributed to the originating prediction source. Fault tests remain separate from live and fixture usage after delayed responses, retries or source changes.
- Include request attribution in example transport metrics and omit unrecognized observations instead of counting them as live usage. Attribution memory is bounded to the latest 1,000 predictions per example server.

# 0.6.2

- Keep successful submission events when an opted-in edited text exceeds the API content limit; omit the optional text instead of losing the event.
- Clarify feedback integration: observe SDK insertions, human edits and Undo through the same value callback; keep the tracker stable between renders. The generated example already uses this wiring.

# 0.6.1

- Fix the example host proxy for an empty feedback-clear POST. Add an HTTP regression check for clearing and origin isolation.

# 0.6.0

- Packaged feedback tracker and bounded idempotent delivery.
- Explicit evaluations, rejection and host-observed outcomes. Edited sent text remains opt-in and attributed.
- Feedback revision and server-side memory clearing in JS and Python (0.2.0).
- API contract for app/user/grant-scoped feedback memory; requires the matching server rollout.

# Changelog

## 0.5.0

- Add optional content-free transport timing and outcome observations; broken observers do not affect predictions or submission.
- Validate isolated customer proxies with opt-in latency and outage injection and private pilot observations. See [pilot validation](docs/pilot-validation.md).
- Add a typed synchronous and asynchronous [Python client](https://github.com/cloneisyou/clone-sdk/blob/main/python/README.md) for all seven app-key operations, with bounded requests, safe errors and server-owned user identity.
- Build and verify Python wheels on Python 3.11 and 3.14. Prepare separate, explicit npm and PyPI publication jobs tied to verified release distributions.

## 0.4.0

- Choose optional grapheme-safe typewriter presentation with `presentation: "typewriter"`; instant remains the default and Tab waits for the complete candidate.
- Bound stalled SDK requests with prediction deadlines and server-side concurrency protection; cancellation also covers response-body reads. See [reliability](docs/reliability.md).
- Offer explicitly started [Clone mode](docs/clone-mode.md) with preview, Stop, scope isolation, turn/time limits, agent attribution, and host completion acknowledgments.
- Follow the [API guide](docs/api.md) and [agent installation guide](docs/start.md) for API Platform, installation choices, outage handling and personalization.
- Try the local interaction example at `?clone-mode=1` to inspect preview, Stop and host completion behavior.

## 0.3.1

- Clarify installation, entry points and repository layout for public distribution.
- Group generated types and the executable React demo by responsibility.
- Clean build outputs and verify the actual package contents before packing.
- Preserve HTTP body cancellation and reject malformed success envelopes without exposing response text.
- Expand server authentication, PKCE, transport and packaging regression coverage.
- Describe the hosted service through its public contract and document the publication review boundary.

## 0.3.0

- Align the one-prompt installation guide and billing documentation with the verified 0.3.0 package.
- Allow an isolated browser-test port through `CLONE_SDK_TEST_PORT`.

- Describe company-level PAYG, shared monthly invoices, alert budgets and opt-in hard limits.
- Represent an unlimited PAYG usage cap as `null` and expose the billing model and cap scope in generated usage types.
- Preserve prediction behavior and the existing runtime exports.

## 0.2.1

- Document app-key authentication and typed success/error responses in the SDK API contract.
- Limit the contract to the seven app-key operations used by the server client.
- Derive server client result types from the generated contract.
- Exclude repository maintenance scripts from the installable package while retaining runnable examples.
- Provide a public security contact and remove unnecessary internal testing details.

## 0.2.0

- Predict from product context without a Clone end-user account or connection.
- Accept optional app-scoped user preferences; keep Clone profile/Goal personalization opt-in.
- Invalidate candidates on changes between product context and Clone connections.
- Update examples and agent onboarding so basic integrations need no callback.
- `connection_id` is optional/nullable in requests and nullable in responses. App-only responses use an empty profile revision and grant revision zero. Existing connected requests retain their behavior.
- Hosts must explicitly disable prediction on logout; absence of a Clone connection no longer disables it.


## 0.1.6

- Fix the README integration example to pass the required language field, so the copied TypeScript snippet compiles against the released package.
- Use the public package type import in the host observation helper so it can be copied into a consumer without rewriting an internal source path.
- Runtime exports and API schema are unchanged.

## 0.1.5

- Fix the examples losing the first typed character after accepting a suggestion when observation state updates during input capture.
- Include submitted messages, their origins and updated conversation revisions in subsequent predictions for React and assistant-ui examples.
- Verify exact edited text, manual corrections and history propagation in packaged consumer tests.
- SDK runtime exports and API schema are unchanged. Live suggestion quality and customer-app acceptance remain separate checks.

## 0.1.4

- Executable React and assistant-ui examples now deliver presentation, acceptance, edit, dismissal and explicit-submission observations through the authenticated backend.
- Preserve each observation ID across delivery retries; do not attribute manual submission after Undo or clearing removes a completion.
- Include the host attribution helper in generated clean-consumer projects and extend browser acceptance tests.
- SDK runtime exports and API schema are unchanged. Fixture observations do not prove suggestion quality or customer adoption.

## 0.1.3

- Private beta delivery through authenticated GitHub release downloads, checksum verification, and local archive dependencies.
- Customer-agent prerequisites and CI instructions now describe repository access explicitly.
- Release CI verifies authenticated download and installation; public npm publication is blocked while the repository is private.
- Runtime behavior, API schema and the MIT license are unchanged.

## 0.1.2

First standalone open-source preview, following private package versions 0.1.0 and 0.1.1.

- MIT-licensed headless controller, React input/hook, optional assistant-ui adapter, and server client.
- Public API schema, agent integration guide, and synthetic video/slide examples.
- Independent build, unit tests, Chromium interaction tests, and packaged React 18/19 consumer checks.
- Separate public Git history, versioned release archives, and publication checks.

Hosted service access is provisioned separately. This release does not establish live suggestion quality, native OS IME support, or acceptance in third-party applications.

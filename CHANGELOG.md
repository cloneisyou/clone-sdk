# Changelog

## Unreleased

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

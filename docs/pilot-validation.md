# Validate a customer integration

Install the verified tarball in a fresh project with `scripts/create-example.mjs` and run `npm install --ignore-scripts` and `npm run build`. This exercises the distributed files rather than repository imports. Use your authenticated server session for the user identity when adapting the example to a customer product.

## Test the actual proxy

The loopback example supports opt-in fault injection. Set `CLONE_DEMO_BACKEND=1`, server-only `CLONE_API_URL` and `CLONE_APP_KEY`, and `CLONE_DEMO_FAULTS=1`, then open `/?connected=1`. For another local port set `CLONE_SDK_DEMO_PORT`. The control is absent when fault injection is disabled. Never deploy this local example or fault controls as a production backend.

Choose 503, 429, 402, network, malformed, timeout (a stalled response body), or latency (five seconds). In each state type, edit, Undo and manually send. Confirm that exactly your draft reaches the host once. Empty drafts must not produce a send. Tab without a candidate must retain normal focus movement. Restore `none`, accept a fresh suggestion with Tab, then send explicitly. Repeat with `?connected=1&assistant=1` for assistant-ui. Test IME on the target OS and customer editor; DOM automation alone does not prove native IME behavior.

## Record observations

Opt in with `CLONE_SDK_METRICS_FILE` pointing to a private local NDJSON file. Records contain timestamps, anonymous per-process request/session hashes, outcome, status and duration. They exclude drafts, responses, keys and account identity. Files are created with owner-only permissions. Keep this file outside source control and do not upload it by default.

The default source is `fixture`. Set `CLONE_DEMO_PROVIDER_MODE=live` only when the connected test service really executes a model. Injected faults are labeled separately. Explicitly label a real customer pilot and obtain its measurement consent before recording its product behavior.

The SDK transport exposes optional `onMetric` for duration through response-body completion, outcome and status. Your product can forward this to its existing diagnostics. Observers cannot block prediction or normal submission. See the example proxy for optional content-free collection.

Operator observations:

```sh
node scripts/pilot-metrics.mjs start ./pilot.ndjson pilot-a
# After clean installation, server wiring and a verified submit:
node scripts/pilot-metrics.mjs verified ./pilot.ndjson pilot-a
node scripts/pilot-metrics.mjs support ./pilot.ndjson pilot-a 10
node scripts/pilot-metrics.mjs report ./pilot.ndjson
```

The report separates fixture, fault and live data; shows p50/p95 latency, failures, observed sessions, event delivery failures and ordered acceptance-to-submission. Optionally set `CLONE_SDK_PILOT_LABEL` to a non-personal consenting pilot label to count repeat sessions for that pilot. Missing telemetry is unknown. Session count does not establish returning customers. Record actual repeat visits and support work with the consenting pilot; do not infer adoption from test reloads or assign invented support minutes.

## Acceptance boundary

A local fixture validates package installation, HTTP wiring and interaction behavior. A live-provider run validates actual model latency and billing receipts. A customer run validates that customer's editor and integration. Each is separate evidence. Do not start broad outreach on the strength of fixture results alone.

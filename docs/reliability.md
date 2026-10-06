# Reliability and limits

## Your composer must keep working

Mount the editor and process typing, attachments, Undo, IME and manual send independently of Clone. Never await prediction in the normal send path, disable the input during prediction, or gate the whole product on Clone health. Hide suggestions on failures. Telemetry is best effort.

SDK 0.8.0 uses a 15-second default client deadline (configurable up to 30 seconds) including response-body reads. The reusable server client limits concurrent requests to 16 by default and fails fast on saturation. The controller drops expired, canceled and identity-mismatched results. Recovery does not send anything automatically. A request whose outcome is unknown must retain its ID and body for reconciliation.

## Configured limits are not measured capacity

The developer console reports your app's current requests-per-minute limit and prediction time limit. These are configured limits, not a guarantee of sustained throughput, active users or an SLA.

Before increasing traffic, measure latency, accepted versus rejected requests, timeouts and normal composer behavior in your integration. Ask Clone for a capacity review when your expected peak exceeds the app limit.

Use optional `onMetric` on `createPredictionTransport` to observe duration, outcome and HTTP status without logging draft text. The [pilot validation guide](pilot-validation.md) covers real proxy fault injection and opt-in measurements.

## Errors

| Status / code | Integration behavior |
| --- | --- |
| 402 quota or configured hard limit | Hide suggestions; preserve manual input/send; do not activate payment automatically |
| 429 `rate_limited` | Observe `Retry-After`; avoid per-keystroke retry loops |
| 503 `prediction_capacity_exceeded` | Service temporarily at capacity; request rejected without a billable suggestion |
| 503 `client_capacity_exceeded` | SDK client's local concurrency bound reached |
| 502 / 503 / 504 | Hide candidate and preserve core service; reconcile the original ID if settlement is unknown |
| malformed JSON / network / never returns | Bound the request and show no candidate; never lose the draft |
| revoked connection | Clear local personalization state; do not retry the same work as a new anonymous request |

## Required outage test

Inject 503, 429, 402, network failure, malformed JSON and a never-resolving request into the real customer proxy. Type and edit text, use Undo/IME, ensure Tab without a candidate traverses focus, and send the exact draft once. Restore the proxy and verify fresh Tab acceptance without sending. Check both empty and nonempty drafts. Test Clone mode separately: Stop, input, expiry and a pending unknown send must not cause duplicate submission.

SDK fixture tests do not establish that an external customer's composer obeys these rules. Inspect its integration and exercise the actual product before asserting customer-service resilience.

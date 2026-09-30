# Direct HTTPS API

## Authentication and base URL

Base URL: `https://api.clone.is`. Send `Authorization: Bearer <app key>` from your backend. Never embed the key in browser or mobile bundles. [Download the OpenAPI contract](https://clone.is/api-platform/openapi.json) for exact field types and response schemas.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/v1/predictions` | Complete a draft or predict the next prompt |
| POST | `/v1/predictions/{request_id}/cancel` | Cancel pending work for the authenticated subject |
| POST | `/v1/prediction-events` | Record a presentation, acceptance, edit, dismissal or successful submission |
| GET | `/v1/usage` | App usage, billing model, remaining sandbox allowance and configured hard limit |
| POST | `/v1/connections` | Start optional user-authorized personalization |
| POST | `/v1/connections/exchange` | Exchange the one-time callback with PKCE and the same subject |
| POST | `/v1/connections/{connection_id}/revoke` | Revoke only this app/user connection |

App keys do not manage company billing or grant access to arbitrary Clone accounts. The owner-only `/v1/developer/apps` API uses a verified owner session or account management token. Use the [developer management reference](https://github.com/cloneisyou/clone-sdk/blob/main/docs/developer-apps.md).

## Prediction fields

| Field | Meaning |
| --- | --- |
| `request_id` | Stable identifier for one request and any replay of that exact body |
| `user_id` | Subject derived from your backend's authenticated session |
| `session_id` | Stable customer thread or workspace conversation |
| `mode` | `next_prompt` with empty draft, or `complete_draft` with nonempty draft |
| `draft` | `text` up to 8,000 characters and monotonic `revision` |
| `context_revision` | Change when relevant conversation, artifact, preferences or selection changes |
| `messages` | Up to 30 recent turns, each up to 8,000 characters; preserve `role` and `origin` |
| `artifact` | Optional `video`, `slides` or `other` with ID, revision, selection and a known text summary |
| `user_preferences` | Optional product-owned preferences, up to 4,000 characters |
| `connection_id` | Omit or null for product context; otherwise an explicitly authorized connection |
| `language` | Requested output language, default `auto` |

Large context is subject to token-budget validation. Do not erase the user's latest correction to fit the envelope. See the schema for exact limits.

## Responses and idempotency

The result echoes request/session/draft/context/connection identity. `usage.prediction_units` is 0 or 1. Acceptance is valid only until `expires_at`; a retained replay receipt does not extend it. Result recovery is available for one hour. Never transform a timed-out paid request into a new ID automatically.

`409 prediction_in_progress` means the original ID is pending; `409 idempotency_conflict` means its body or subject changed. `410 prediction_replay_expired` ends result recovery. Terminal failed or canceled IDs do not execute again. [Error and outage behavior](https://clone.is/docs/reliability).

## Observation events

Send `{ "event_id": "event-001", "request_id": "first-prediction-001", "user_id": "your-authenticated-user", "kind": "presented" }` to `/v1/prediction-events`. Allowed kinds are `presented`, `accepted`, `edited`, `dismissed`, `submitted`. Keep the same event ID on retries. Include no prompt text. Events do not change billing.

Record `submitted` only after your host accepts the send. Automatic Clone mode prompts have message origin `agent`; they must not be counted as independently human-written preferences or manual Tab acceptance.

## Python, without the SDK

```python
import json, os, urllib.request

with open("prediction.json", encoding="utf-8") as source:
    payload = json.load(source)
request = urllib.request.Request(
    "https://api.clone.is/v1/predictions",
    data=json.dumps(payload).encode(),
    headers={"Authorization": "Bearer " + os.environ["CLONE_APP_KEY"],
             "Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(request, timeout=15) as response:
    result = json.load(response)
# Validate identity and expiry before presenting result["completion"].
```

Use your host's cancellation and concurrency limits in production. The API returns predictions; your application owns agent execution and permissions.

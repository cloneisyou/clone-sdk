# Self-service developer apps

Use [Developer apps](https://clone.is/developer/apps) for the browser flow. A coding agent can perform the same operations over HTTPS at `https://api.clone.is/v1/developer/apps`. This management API is separate from the SDK prediction client. SDK 0.5.0 retains PAYG usage types with a nullable spending cap and the existing prediction request contract. Request and response schemas are also available in the hosted API's `/openapi.json` under the `Developer apps` tag.

## Authentication and ownership

Use the customer's verified Clone account. If account access is not available yet, follow [browser onboarding](browser-onboarding.md) to guide login/signup and resume the task; do not require a customer-made token as the first step. The console uses its normal signed-in session, so browser agents can manage apps without a separate account token. A non-browser agent uses a **manual account API token**, issued at [Account API tokens](https://clone.is/clone-api), from the customer's approved secret store. In the examples, `CLONE_DEVELOPER_TOKEN` means that optional account token; it is not a new token type. It has account-level access, not an onboarding-only scope. Keep it out of the customer app runtime and revoke only a temporary integration token created for this task when the work is finished.

Send `Authorization: Bearer <account token>` and JSON content type. Cookie requests require the exact Clone web Origin for writes. Server agents need no Origin header. Desktop credentials and `clnp_...` app keys cannot manage apps. Prediction calls continue to use `CLONE_APP_KEY`.

An account owns one app collection and one shared lifetime sandbox allowance of 1,000 predictions. It can create up to 20 apps, including disabled apps. Do not create accounts or apps to evade limits. Existing operator-created apps cannot be claimed by specifying their IDs. Team membership delegation, ownership transfer, and restoring disabled apps are outside this API. Company PAYG card billing has separate owner-only [billing endpoints](billing.md).

## Agent procedure

1. Inspect the customer backend and authenticated user session. For basic predictions, create an app with `redirect_uris: []` (or omit it). No end-user Clone login or callback is required. Implement and register a state/PKCE callback only when adding optional Clone personalization.
2. `GET /v1/developer/apps`. Reuse an existing intended app and its stored key. The response includes `apps`, aggregate `sandbox_used`, and `sandbox_limit`. It never returns keys or hashes.
3. If there is no intended app, `POST /v1/developer/apps` with the request below. The `slug` is a stable customer-chosen suffix, lowercase letters/digits/hyphens, at most 40 characters. Save the full returned `app.id`; do not infer it from the slug.
4. Save the returned `api_key` directly as `CLONE_APP_KEY` in the approved backend secret store. The response is the only display of that key. Store `CLONE_API_URL=https://api.clone.is`; configure and pass the callback explicitly.
5. For a callback change, GET the current app list, then PATCH the full desired configuration with `expected_revision` equal to that app's `config_revision`.
6. Run the integration and acceptance checks in [start.md](start.md). Fixture checks need no service credentials.

Create request:

```json
{
  "slug": "my-product-sandbox",
  "name": "My product sandbox",
  "redirect_uris": [],
  "allow_loopback": false
}
```

Successful creation is HTTP 201 with `{ "app": { ... }, "api_key": "clnp_..." }`. Treat `api_key` as a secret; never log the full response. `app` contains `id`, `tenant_id`, `name`, `redirect_uris`, `allow_loopback`, `config_revision`, `active`, `plan`, `monthly_cap_cents`, `payg`, and `sandbox_used`. The initial plan is sandbox. `monthly_cap_cents` is the legacy per-app manual-contract guard; PAYG returns null here and exposes the company hard limit through billing. It is not a charge or paid activation.

If only a local environment file is available and the customer permits using it, exclude it from Git, use owner-only file permissions, and pass secrets through environment variables or a secret-store API. Do not put bearer tokens in command arguments, commit the file, print response bodies, or enable HTTP debug logging. Prefer the host's existing secret-management mechanism.

## Callback changes

`PATCH /v1/developer/apps/{app_id}` accepts the full editable configuration:

```json
{
  "name": "My product sandbox",
  "redirect_uris": [
    "https://staging.customer.example/api/clone/callback",
    "https://app.customer.example/api/clone/callback"
  ],
  "allow_loopback": false,
  "expected_revision": 1
}
```

The response is `{ "app": { ... } }` with an incremented revision. An empty list disables new Connect Clone attempts without disabling product-context predictions. For optional personalization, use HTTPS URLs matching exactly, with no wildcard, credentials, query or fragment. At most ten distinct URLs of 2,048 characters each are accepted. Sandbox apps may opt into literal `http://127.0.0.1:<port>/<path>` callbacks; paid apps require HTTPS.

Adding a new callback preserves existing attempts. Removing an old callback invalidates pending authorization and code-exchange requests for that URL. Already exchanged connections remain active. Register both routes during a rollout, deploy the new route, then remove the old route when desired.

## Rotation and disabling

| Operation | Request body | Result |
|---|---|---|
| `POST /v1/developer/apps/{app_id}/rotate-key` | `{ "expected_revision": 2 }` | New `api_key` once, updated `app`; old key immediately invalid |
| `POST /v1/developer/apps/{app_id}/disable` | `{ "expected_revision": 2 }` | Updated inactive `app`; all app-key access blocked |

Only rotate or disable when explicitly intended by the customer. Neither operation resets usage. Rotation has no grace period: coordinate it with backend secret replacement. Disabling is not reversible through this API. An owner account deletion also blocks its self-service apps.

## Failure and retry behavior

Most domain failures use `{ "detail": { "code": "..." } }`; request-validation 422 responses contain a `detail` array with the affected fields and validation messages.

| Status / code | Recovery |
|---|---|
| 401 / authentication failure | Use a valid account session or manual account token. Do not substitute the app key. |
| 403 / `verified_account_required` | Complete the account's normal email verification. |
| 403 / `developer_credential_required` | Replace a desktop credential with an account session or manual account token. |
| 403 / `invalid_developer_origin` | Use the Clone console or a server HTTP client, not a foreign browser origin. |
| 404 / `app_not_found` | The app is absent or belongs to another account. |
| 409 / `app_already_exists` | List apps and reuse the existing ID. No key is reissued. |
| 409 / `app_configuration_changed` | Read current state, reconcile intended changes, then send its new revision. |
| 409 / `app_limit_reached` or `app_disabled` | Respect the account limit or inactive state. Do not recreate to reset usage. |
| 400 / `invalid_callback_url` or `loopback_requires_sandbox` | Correct the callback policy or use a separate sandbox app. |
| 422 | Correct the request schema; never send tenant, plan or quota overrides. |

Do not automatically retry mutations after a lost response. GET the app list to find the result. If a create or rotation response was lost, the plaintext key cannot be recovered. Reuse a safely stored key if available; otherwise perform an explicitly intended rotation using the latest revision and immediately save its result. A timed-out PATCH can be verified by comparing the stored callback list and revision before deciding whether another write is needed.

## Pricing and card billing

Open [SDK pricing](https://clone.is/pricing#sdk) without signing in. In [Developer apps](https://clone.is/developer/apps), open **Usage and billing** for an app to see its company usage, alert budget and optional hard limit, upcoming charge date, saved card, and invoices. Paid activation requires the customer’s explicit agreement and verified card setup. An ordinary SDK integration prompt does not authorize an agent to start a paid contract. See [billing](billing.md) for prices, timing, and recovery.

# Account setup through browser and computer use

This guide sets up the customer developer’s app and billing identity as part of the [one-prompt integration](start.md). End users do not need Clone accounts for basic predictions. The agent should navigate onboarding and resume implementation, rather than hand the customer a preparation checklist. Use only supported tools and the customer's authorized account. A documentation link does not grant new account, inbox or secret-store permissions.

## Choose the shortest available path

| Available access | Agent action |
| --- | --- |
| Existing app key in the approved backend secret store | Reuse it. Obtain owner access to verify production billing or change app settings; an app key cannot read company billing. |
| Existing manual account token in the approved secret store | Use the [developer API](developer-apps.md). No browser bootstrap is necessary. |
| Authorized browser/computer-use tools | Open [Production setup](https://clone.is/developer/apps?setup=production), reuse the signed-in owner session, or guide login/signup in that browser. A separate account token is not required. |
| Neither account credentials nor browser access | Continue inspecting the product and implementing fixture tests. Ask the customer for browser access or one login at the exact console link, not a list of keys to create. |

Before creating anything, inspect existing apps and the project's configuration. Establish where the one-time app key can be stored and whether the tools support transferring it without exposing it in transcripts. Do not create duplicates on retries or change a working key because you cannot see its plaintext.

## Establish the Clone session

1. Open `https://clone.is/developer/apps?setup=production`, or `?setup=sandbox` for an explicitly chosen evaluation. Preserve the complete `next` destination through login/signup so the selected path is retained. Read the actual screen before interacting. Check the owner identity through Account settings; never silently use a different signed-in account.
2. Reuse the session or the customer's available authorized login method. If no account exists, follow **Sign up**, retaining the `next` destination. Use the customer's chosen identity. Do not invent an account, email address or password to complete the task.
3. Let the customer complete unavailable credentials, new-password entry, identity checks and required agreements according to the tool's rules. Use an authorized email tool only for the specific verification message when such access is already granted; otherwise hand off that step in the browser. Never request a password, OTP or verification URL in chat. Optional analytics choices and selected context are not prerequisites for app registration.
4. Return to Developer apps and verify that the app list/create form loads. A signed-in header alone is not proof of a verified developer account. If a required customer action interrupts the task, retain only non-secret progress and continue independent code work. Resume at the same step after it is completed.

### Email verification and recovery

If Developer apps reports that the account email needs verification, follow **Verify email** to `https://clone.is/verify-email`. Confirm the signed-in account shown there, then choose **Send verification email**. This sends to that account only. Use the newest link: sending another verification email invalidates older links.

Never copy the verification link or token into chat, logs or source files. If the page asks for sign-in, use **Sign in** in the new tab, then return to the original verification tab and choose **I've signed in**. Keep that tab open. After a reload, reopen the original email link if it has not been used or expired. If the link belongs to another account, sign in to the intended account and reopen it.

After verification succeeds, choose **Continue to Developer apps** and confirm that the app list/create form loads. A successful fixture test does not establish that a deployed environment can deliver email. If the page or email delivery is unavailable, report the exact service failure and continue independent integration work. Do not bypass verification or fabricate credentials.

## Register the app in the console

For basic predictions, leave callbacks empty. Only for optional Clone personalization, derive a callback from the customer’s actual backend and deployment configuration. Do not guess a production domain.

1. In Developer apps, inspect **Your apps** and reuse the intended app. For an existing app, **Edit callbacks** opens its settings. Keep a still-needed old callback during rollout.
2. For a new app, fill **App name** and **App ID**. **Callback URLs, one per line (optional)** can stay empty. The App ID field is a slug; the full resulting app ID must be read back rather than inferred. For local testing only, enable the checkbox for exact `http://127.0.0.1:<port>/<path>` callbacks. See [callback policy](developer-apps.md#callback-changes).
3. In the default **Production integration** path, choose **Register app and continue**. For the separate **Try the free sandbox** path, choose **Create sandbox app and key**. Follow any required tool confirmation for creating credentials. Both initially register a sandbox app; registration alone never authorizes paid activation. The console exposes **Copy app key** and **I saved the key** after creation.
4. Transfer the key directly into the approved backend secret store as `CLONE_APP_KEY`, verify its presence without showing its value, then dismiss it with **I saved the key**. Do not reload or navigate away before storage is confirmed. Save `CLONE_API_URL=https://api.clone.is` and any optional callback configuration too.
5. Read back the app ID, callback list and sandbox state. If a save reports a configuration conflict, reload and reconcile. Never repeat a create/rotation blindly after a lost response. Keep non-secret app identity in the project configuration or integration report so later runs resume rather than restart.

### One-time secrets and tool capabilities

The current console renders the plaintext key once; an unrestricted screenshot or accessibility snapshot can therefore expose it. Check this before issuing a key. If the tooling supports a protected clipboard-to-secret-store or equivalent secret channel, use it without returning the value, recording the key region, or reading unrelated clipboard data. Never extract browser cookies or session storage to manufacture a management credential.

If the available tools necessarily expose the secret, prepare the form and exact secret destination, then let the customer perform the issue/copy/save steps directly. Resume after the key is saved and dismissed. This is a specific capability limitation, not a reason to ask every customer to copy keys manually. Never fall back to pasting keys into the conversation or tracked files. A local ignored environment file is acceptable only under the customer's policy, with owner-only permissions.

## Optional account token for API automation

Prefer the browser session when it is enough. If repeated server-side management is needed and the customer intends to grant it, open [Account API keys](https://clone.is/clone-api). Fill **Key name** with a product-specific integration label and use **Create key**, respecting required credential-access confirmation and the same secret-transfer rules above. Store it as `CLONE_DEVELOPER_TOKEN` in the integration environment only. It is an account-level credential, not an app-scoped or automatically expiring onboarding grant.

Use that token with the [developer API](developer-apps.md), which returns the runtime app key separately. After onboarding, revoke only the temporary account token created for this task and verify its removal. Do not revoke a pre-existing shared token. Keep `CLONE_APP_KEY` in the product backend; removing the temporary management token does not remove the app key.

## Complete pricing and card setup

In the production path, **I saved the key** opens pricing and card setup for that app. Show the current unit price and **No charge when you register your card. Actual usage is billed monthly.** The customer personally accepts the PAYG checkbox and completes Stripe card registration. Do not accept billing terms or enter card data on the customer's behalf. An existing company card can be reused through **Enable PAYG for this app** after explicit consent.

On return, the console verifies setup through the server and reads current billing before showing **4. Install the SDK** and **Copy integration prompt**. Check the active app's `plan: "paid"`, `payg: true` and company mandate; do not treat `billing=success`, a saved-card summary or the sync response alone as completed activation. If setup is canceled, pending, or unavailable, reconcile the same app with **Refresh billing** and use **Add company card and enable PAYG** to reopen unfinished setup. Do not create another app/key or silently switch to a free trial. A deliberate switch to **Try the free sandbox** is allowed while the app is still sandbox.

The free sandbox path shows installation after the key is saved and does not call paid checkout or enable. The URL stores only the selected path and non-secret app ID, so a return or reload resumes the app without preserving its one-time secret. The key must already be in the approved secret store.

## Resume integration and verify

After verified company billing, or an explicitly selected sandbox path, continue [package installation](start.md#2-obtain-and-install-the-package) and [integration](start.md#3-integrate-with-the-product) without asking for another setup prompt. The finished product must predict without showing Connect Clone first. If an end user chooses optional **Connect Clone** in settings, they separately sign in and consent to selected synced sources. App registration does not grant that consent. Do not preselect private context or claim connected tests passed without an authorized connection.

Return the implemented files and test results, plus any exact outstanding authentication, secret-transfer, service-access or deployment dependency. Distinguish a verified existing-account flow from a fresh-account flow. Follow the [release access instructions](releases.md#release-access-and-ci) if GitHub access is restricted. No `npx` bootstrap command or docs MCP is currently supplied.

## Paid billing requires the customer's explicit consent

The [SDK pricing page](https://clone.is/pricing#sdk) is public. Production setup shows pricing and card registration before installation. **Usage and billing** remains available for company budgets, invoices and payment recovery. Creating an app, integrating the SDK, and running the bounded sandbox test do not authorize recurring billing. Only start paid activation when the customer has explicitly approved that product, PAYG unit price and company billing terms. See [billing](billing.md).

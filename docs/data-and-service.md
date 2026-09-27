# Data and service boundaries

The SDK is free under the MIT license. Clone's hosted prediction API is a separate service. The prepared PAYG policy is documented in [pricing and billing](billing.md). Confirm current availability and prices in the [service catalog](https://clone.is/pricing#sdk) when hosted billing launches; retention commitments and any SLA must still be confirmed with Clone. This repository is not a service-level agreement. See Clone's [privacy policy](https://clone.is/privacy) and [terms](https://clone.is/terms), and confirm application-specific service commitments through [contact@clone.is](mailto:contact@clone.is).

## What is sent

The browser sends the current draft, recent app conversation, context revisions, optional app-scoped user preferences, and optional text summaries of the selected artifact to your own authenticated backend. Your backend supplies the authenticated user ID and calls Clone with its server-only app key. Do not send raw video/slide binaries or unrelated app data.

By default `connection_id` is omitted or null and predictions use only the supplied product context. The service does not discover an end user’s Clone account or read any Clone profile in this mode. Send current permitted preferences on every request; basic requests do not carry preferences forward to future requests. Optional Connect Clone requires the user to sign in and explicitly select synced context. The SDK does not read or upload local Clone files. A disconnected or unsynced user must not be represented as having connected personalization. Source changes may require renewed consent; handle `context_changed_reconnect` by clearing the candidate and asking the user to reconnect.

## Cancellation and accounting

Keep each request ID stable when recovering an unknown transport outcome. The API can reject reuse with a different payload. New IDs may create new chargeable work. Acceptance/presentation events are separate from generation and do not indicate that a user sent a message.

Aborting a client request prevents the SDK from inserting a late result. It does not guarantee that the service avoided work or reversed a charge already settled. Your backend should forward cancellation and use the service's cancellation endpoint where appropriate. Check service usage receipts for accounting.

On logout or account switch, disable prediction and clear the displayed candidate, connection and attribution before binding the next authenticated host session. On Clone disconnect, clear the old candidate and connection; subsequent new requests can continue with product context. An explicitly invalid or revoked connection still fails, with no automatic fallback or duplicate billed request. Revocation cannot retract text the user has already copied or sent. Avoid logging drafts, context, keys, connection flow secrets, callback query strings, or completion text.

## Test boundaries

The demo returns deterministic synthetic suggestions. It proves UI mechanics only. Keep provisioned sandbox API behavior, consent/revocation, application authentication and browser/editor checks separate from fixture tests. Complete automated integration with available evidence; do not require additional human real-use sessions or manual QA. If app issuance is unavailable, report API verification as pending. Missing Clone consent affects only optional personalization verification; basic API predictions need no Clone end-user account. Native OS IME and human usefulness remain unverified without evidence specific to them. Do not present fixture success as evidence of suggestion quality or customer adoption. See [the agent entry point](start.md) for the bounded verification and onboarding workflow.

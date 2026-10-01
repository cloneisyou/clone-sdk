# Pricing and billing

SDK 0.6.2 supports both sandbox and pay-as-you-go (PAYG) usage, including an optional company spending limit. Install the verified [0.6.2 release](https://github.com/cloneisyou/clone-sdk/releases/tag/v0.6.2). Hosted paid activation is available only when the developer console offers it; installing the SDK never enables payment.

The company operating your product pays for hosted predictions. End users need no Clone account or personal subscription. SDK code is MIT licensed. The public catalog is [SDK pricing](https://clone.is/pricing#sdk); availability depends on rollout, and existing individually negotiated contracts remain unchanged.

| Item | PAYG policy |
| --- | --- |
| Sandbox | 1,000 valid suggestions once, shared across the developer account's apps; no card or automatic upgrade |
| Production API | USD 0.02 per valid suggestion |
| Monthly fee / minimum / included allowance | None |
| Payer | One customer company account; all its enabled apps share a card and monthly invoice |
| Default spending hard limit | None |
| Alert budget | Optional company budget; email notices at 80% and 100%, no API interruption |
| Hard stop | Only if the customer explicitly enables a separate company hard limit |
| Billing cycle | Actual usage after each UTC calendar month, starting the next first day |

Examples: 0 suggestions cost $0; 1,000 cost $20; 10,000 cost $200. A unit is a valid suggestion generated and settled by the server, whether the user accepts it or not. No suggestion, errors, cancellation before settlement, and identical request replays add no charge. Different requests can incur separate charges. Optional Clone personalization has the same unit price.

## Card registration

1. Open [Production setup](https://clone.is/developer/apps?setup=production) with a verified company developer account. Register or select the app. Store its one-time key before leaving the page and select **I saved the key** to continue to pricing and card setup. Existing apps expose **Continue production setup**. **Try the free sandbox** is a separate card-free evaluation path.
2. Review and explicitly accept PAYG terms. **Add company card and enable PAYG** opens the hosted Stripe card-registration page. No usage fee is charged during card setup.
3. Return to the console and confirm that the app shows PAYG as enabled. Returning from the payment page alone is not confirmation. Use **Refresh billing** if the status has not updated.
4. The console shows SDK installation and verification instructions only after reading the active app's paid/PAYG state. Card registration alone does not mean the SDK is installed or tested.
5. Additional apps remain sandbox until explicitly enabled through **Enable PAYG for this app**. They reuse the company card and invoice.

Empty callbacks are valid for basic predictions; configured paid callbacks must use HTTPS and cannot enable loopback. The card number stays on Stripe. Incomplete setup leaves the app in sandbox. App creation, rotation, and disabling never replenish sandbox quota. An integration prompt alone does not authorize an agent to activate paid usage.

## Usage, budgets, and payment recovery

The console shows company totals, each app's usage, accrued charge, next billing date, card summary and invoice/receipt/PDF links. **Manage company card and invoices** opens the company Stripe portal, separate from personal Clone billing. To stop new usage, disable an app; only actual usage already incurred remains payable. There is no monthly subscription to cancel.

Budget alerts do not stop service. The separate, unchecked-by-default hard-stop option covers usage across all PAYG apps, including pending requests. If explicitly enabled, it returns `402 customer_hard_limit_reached` before the limit is exceeded. Removing or raising the limit resumes new requests. Rate limits and security controls still apply.

Missing, pending, or failed invoices do not automatically suspend PAYG predictions. Owners receive a payment notice and a 7-day recovery period. Update the card or complete payment/authentication through the hosted invoice. The end of this period does not automatically interrupt service; any later suspension requires a separate notice from Clone.

Zero usage creates no Stripe charge. When an invoice is below Stripe's minimum charge, Stripe may mark it paid and carry the amount into the customer balance for a future invoice. The console separately reports the actual collected amount and balance carried forward. See [Stripe invoice behavior](https://docs.stripe.com/api/invoices). A Stripe `paid` status alone is not evidence that a card was charged.

## Developer billing API

Only a verified owner session or manual developer account token can access billing; app keys cannot. Cookie mutations require the approved web origin. These routes follow `/v1/developer/apps/{app_id}/billing`; the app identifies its owning company, while estimates, budgets and invoices are company-wide.

| Method | Contract |
| --- | --- |
| GET root | App `config_revision`, company `billing_revision`, PAYG state, per-app/company usage, budget/hard limit, card, invoices and grace status |
| POST `/checkout` | `expected_revision` from the app and `accepted_terms_version: "2026-09-23-payg"`; returns hosted card setup URL |
| POST `/enable` | Same consent and app revision; enables another app on an active company mandate |
| POST `/sync` | Refreshes card setup and invoice status |
| POST `/portal` | Returns hosted company card/invoice portal URL |
| PATCH `/budget` | Company `expected_revision`, nullable `budget_cents`, nullable `hard_limit_cents`; null removes that setting |

Read state after changes. App and company revisions have different scopes. `409 billing_configuration_changed` or `app_configuration_changed` requires a refresh. `502 billing_processor_unavailable` requires reconciliation before retry. `409 billing_reconciliation_required` requires support, not a new app. Public `GET /v1/developer/pricing` is unauthenticated. `/v1/usage` remains app-specific; PAYG `monthly_cap_cents: null` means no hard limit, `cap_scope: company` identifies a configured limit's scope, and `invoice_cents` is that app's accrued charge, not a separate invoice.

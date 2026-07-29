# 17 — Billing Lifecycle & Failed-Payment Policy

How All Elite Cloud processes Stripe subscription events, and the exact
grace-period behavior when a payment fails. Source of truth:
`src/platform/createPlatformApp.ts` (`handleStripeEvent`),
`src/platform/billing/BillingService.ts`, and
`src/platform/billing/StripeSubscriptionGateway.ts`.

## Webhook processing

The endpoint is `POST /webhooks/stripe`, mounted with `express.raw` **before**
`express.json` so the exact raw body is available for signature verification.

1. **Signature first.** Every event is verified with the raw body against
   `STRIPE_WEBHOOK_SECRET` (HMAC-SHA256, 5-minute freshness window). An invalid,
   missing, stale, or tampered signature → **400**, nothing is processed.
2. **Idempotency.** The event id is recorded in `stripe_processed_events`
   (`INSERT … ON CONFLICT DO NOTHING`). A duplicate/replayed delivery is a
   **no-op** — each event id is applied at most once.
3. **Ack 200 always** (after signature passes) so Stripe never retries our own
   processing errors.

## Supported events

| Event | Effect |
|---|---|
| `checkout.session.completed` | Activate the paid plan; **store** `stripe_customer_id` + `stripe_subscription_id` (this establishes the tenant↔Stripe mapping). Status → `active`. |
| `customer.subscription.updated` | Map Stripe status → ours (below); keep the plan (or update it if the event carries a known `planId`). A mapped `canceled` drops to the default plan. |
| `customer.subscription.deleted` | Cancel: revert to the default (Essentials) plan, status → `canceled`. |
| `invoice.payment_failed` | Status → `past_due`. **Plan/access retained.** |
| `invoice.paid` | Payment recovered: status → `active` (unless already definitively `canceled`). |
| anything else | Acknowledged and ignored. |

Stripe status mapping (`mapStripeStatus`): `active`/`trialing` → `active`;
`canceled`/`incomplete_expired` → `canceled`; everything else
(`past_due`/`unpaid`/`incomplete`/`paused`/unknown) → `past_due`.

## Tenant binding (no trust in mutable identifiers)

- `checkout.session.completed` binds via the `organizationId` we set in the
  session metadata — the establishing event.
- **Every other event binds via the stored `stripe_customer_id` (then
  `stripe_subscription_id`) → org lookup** captured at checkout. This is the
  authoritative, tamper-resistant mapping; the event's own metadata is only a
  fallback used **when no stored mapping matches**, and the stored lookup always
  wins. A signature-verified event whose metadata names a different tenant can
  therefore never redirect changes to that tenant.
- An event for an unknown/unmapped customer resolves to no tenant and is
  safely ignored.

## Failed-payment grace policy

When `invoice.payment_failed` arrives:

1. The subscription is marked **`past_due`**.
2. **Service is fully retained** — no feature/plan gate inspects status, so the
   tenant keeps its current plan's limits during Stripe's automatic retry
   ("smart retries") window.
3. Owner/admin users see a **billing warning** on the dashboard plus an
   **"Update payment method"** button that opens the Stripe Billing Portal
   (`POST /api/platform/billing/portal`, owner/admin only — never members).
4. If a retry succeeds, Stripe sends `invoice.paid` and status returns to
   **`active`** automatically.
5. **Access is only reduced when the subscription is definitively `canceled`**
   (Stripe exhausts retries and cancels, or an admin cancels) — at which point
   the tenant reverts to the free **Essentials** plan and its limits.
6. **A payment failure never deletes tenant data.** Cancellation only changes
   the plan; all of the tenant's records remain intact.

Effective grace period = Stripe's configured retry schedule for the sandbox/
account (default smart retries, up to ~3 weeks) until Stripe emits
`customer.subscription.deleted`. Tune it in the Stripe Dashboard → Billing →
Subscriptions retry settings; the application honors whatever Stripe decides via
the `deleted` event.

## Auditing

Each lifecycle transition records a system audit event —
`billing.subscription.activated/updated/canceled`,
`billing.payment_failed`, `billing.payment_recovered` — with the org and a
minimal status/plan note only. **Never** logged: Stripe secrets, customer/
payment/invoice/event identifiers beyond what's stored, webhook signatures, or
card details.

## Related

- `04_SECURITY.md` (webhook signature verification, secret handling)
- `16_PRODUCTION_CUTOVER_CHECKLIST.md` (§ Stripe test-mode → live-mode at cutover)
- `03_API.md` (`/billing`, `/billing/plan`, `/billing/portal`, `/webhooks/stripe`)

## Revision history

| Version | Date | Notes |
|---|---|---|
| 1.0 | 2026-07-28 | Full lifecycle (5 events), idempotency ledger, stored-id tenant binding, past_due grace policy, billing portal |

# Domain Registration — Stage 6 Report (Stripe-bound purchase saga)

**Stripe TEST MODE + fake/sandbox registrar only.** No production provider
mutation, no real registration, no live Stripe charge, no refund, no deploy, no
legal publication, no email, no production key provisioning. The saga is not
wired into the running app. Marketing remains disabled and untouched.

## Exact commits
- **Stage 6a** `e9472d3` — saga state machine + Stripe(test) boundary + schema.
- **Stage 6b** `6e03866` — purchase saga + fulfillment/refund/reconciliation +
  tests.

## State-transition table (illegal transitions fail closed)

| From | Allowed → |
|---|---|
| quote_ready | checkout_created, canceled |
| checkout_created | awaiting_payment, canceled |
| awaiting_payment | payment_captured, canceled, needs_attention |
| payment_captured | fulfillment_queued, needs_attention |
| fulfillment_queued | registering, needs_attention |
| registering | registered, registration_unknown, provider_rejected, registration_failed, needs_attention |
| registration_unknown | registered, refund_queued, needs_attention *(NO retry, NO direct refund)* |
| provider_rejected | refund_queued, needs_attention |
| registration_failed | refund_queued, needs_attention |
| refund_queued | refund_pending, needs_attention |
| refund_pending | refunded, refund_failed |
| refund_failed | needs_attention, refund_pending |
| needs_attention | registered, refund_queued, refund_pending, registering, canceled |
| registered / refunded / canceled | *(terminal)* |

Separate durable facts are tracked in their own fields and never folded into
`status`: **payment_state** (none/checkout_created/captured/failed),
**registrar_state** (none/queued/registering/registered/rejected/failed/unknown),
**refund_state** (none/queued/pending/refunded/failed). `registering` is
unreachable except via `fulfillment_queued`, which is reachable only after
`payment_captured` — so **registration can never precede payment capture**.

## Database constraints (proven against real PostgreSQL — prod UNCHANGED at 74)

Ran in a disposable schema (dropped after; production `public` unchanged):
- **one active purchase saga per accepted quote** — `domain_orders_quote_uniq` ✅ rejected a duplicate
- **one captured PaymentIntent per order** — `domain_orders_pi_uniq` ✅ rejected a duplicate
- **one active purchase per (org, domain)** — `domain_orders_active_uniq` ✅ rejected a duplicate
- **one refund per order** — `domain_refunds_order_uniq` ✅ rejected a duplicate
- **unique refund idempotency key** — `domain_refunds_idem_uniq` ✅ rejected a duplicate
- **one confirmed registration per (provider, domain)** — `domain_registrations_provider_domain_uniq` (Stage 3, still enforced)

Schema deltas are additive `ALTER … ADD COLUMN IF NOT EXISTS` + new
`domain_refunds` table; fresh init = 13 domain tables, idempotent re-init
unchanged.

## Crash-window proof (convergence by construction)

Every step is **idempotent and constraint-guarded**, so a crash at any of the
eight windows converges on restart without a second charge, registration, or
refund:

| Crash window | Why restart is safe |
|---|---|
| after Checkout create, before response | order carries a deterministic `checkout:<id>` idempotency key + `checkout:<order>` Stripe key; re-create returns the same session; `domain_orders_quote_uniq` blocks a second order for the quote. |
| after Stripe capture, before queueing | capture is driven by the webhook, which is idempotent (event-id dedup + `payment_state='captured'` short-circuit); a replay re-queues to the same state. `domain_orders_pi_uniq` binds one PI to one order. |
| after queueing, before registrar claim | the worker claims via lease (`FOR UPDATE SKIP LOCKED`); an unclaimed/expired lease is simply re-claimed. |
| during registrar request, before response | register uses `register:<order>` idempotency; an unknown outcome → `registration_unknown` (no retry); a pre-acceptance failure is safely retried; `domain_registrations_provider_domain_uniq` blocks a duplicate registration record. |
| after provider success, before DB commit | on restart the order is still `registering`; re-run re-checks status (reconcile path) and the unique registration guard prevents a duplicate; no second registrar mutation. |
| after definitive failure, before refund enqueue | refund enqueue is idempotent (`domain_refunds_order_uniq` + `refund:<order>` key); re-run creates at most one refund. |
| after refund request, before response | `createRefund` uses the deterministic idempotency key; Stripe returns the same refund; state stays `pending`. |
| after Stripe refund success, before local commit | refund only flips to `refunded` after re-reading Stripe (`getRefund`/webhook); re-run reconciles to the confirmed state. |

Deterministic tests exercise these mechanisms (idempotent webhook, no double
capture, no blind retry, refund idempotency, confirm-before-refunded). Literal
process-kill integration tests against real PG are scheduled for the Stage 13
pre-deployment integration run.

## Safety boundaries (tested)
- **Never register before capture; never trust the browser success URL** — capture
  is webhook-only; a browser-return-without-webhook leaves the order
  `awaiting_payment` and never registers.
- **Ambiguous outcome** → `registration_unknown`, **no auto-retry, no auto-refund**;
  a second worker pass does not re-register; only read-only reconciliation or an
  **evidence-gated** owner action resolves it, with **no blind duplicate
  registration**.
- **Stripe integrity** — raw-body HMAC signature verify; event-id dedup;
  amount/currency/status re-read from Stripe and matched to the **stored** order;
  mismatch → `needs_attention`, not captured.
- **Price policy** — cost increase / premium-status change / unavailable-after-pay
  all → definitive failure → refund; the customer is never charged more and no
  substitute domain is registered. Absorption is not invented (not implemented).
- **Refund integrity** — refund ≤ captured amount; deterministic idempotency;
  never reported `refunded` until Stripe confirms; a failed refund stays
  `refund_failed` → `needs_attention`.
- **Registrar funds** — insufficient funds is a definitive fulfillment failure →
  refund with a coarse `registrar_funding_required` reason (no wholesale balance
  exposed to tenants).
- **Permissions** — purchase is **owner-only + recent reauth**; members/admins
  rejected; cross-tenant order/quote/refund access fails closed.
- **Audit/privacy** — audit events carry only `{orderId, from, to, kind}` (ids +
  enums); no names/emails/addresses/keys/secrets. Notice **intents** are designed
  (Stage 5 catalog) but **not sent**.
- **Pricing** — provider price is dynamic/authoritative at quote + re-checked
  before submission; retail works now, and account-specific (discounted) pricing
  would be picked up automatically with no code change. Commercial markup remains
  **provisional/test-config** (no production customer pricing approved).

## Test totals / typecheck / build
- Saga tests: **26 passed**. Full local suite: **1628 passed / 9 skipped**
  (the lone local failure is the documented Windows-only `createPlatformApp`
  ECONNRESET flake, which passes on Linux). **Typecheck + build PASS.**
- **Linux CI: GREEN** — commit `845f5b7`, run 32058382836. (The first push failed
  only because the `/legal` index correctly shows the new domain-registration
  terms as "being finalized"; the assertion was updated to expect that.)

## Residual risks / not-in-scope
- **HTTP webhook route + management UI/API** for the owner reconciliation controls
  are Stage 11 (the saga exposes the service methods + owner-control methods now,
  fully tested; route/UI wiring is deferred).
- **Real-PG saga persistence integration + literal crash-window tests** are the
  Stage 13 pre-deploy run (unit tests use the in-memory repo; the PG paths compile
  and the constraints are validated).
- **Stripe test-key + webhook secret** not provisioned; **NameSilo OTE** sandbox
  contract test still pending sandbox creds; restoration price still BLOCKED.
- **Discount Program** enrollment is an owner decision (retail is authoritative
  now); tax/fee handling at checkout to be finalized when applicable.

## Confirmation
No production DB/env change; no domain/DNS/payment/refund/email/credential/
provider mutation; terms unpublished; nothing deployed or enabled.

## GO / NO-GO
- **Stage 7 (registration worker hardening + reconciliation UI) / Stage 8 (DNS +
  hosting attach): GO** on your approval — sandbox/test-only, purchasing disabled.
- **Live Stripe / production registrar mutations / real registration / deploy /
  publish terms: NO-GO.**

**Stopping after this Stage 6 report for your review.**

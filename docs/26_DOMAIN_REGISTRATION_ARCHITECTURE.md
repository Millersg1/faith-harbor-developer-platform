# Domain Registration — Architecture & Inventory Report (Stage 1)

**Status: DESIGN ONLY. No code beyond this document. Nothing built, deployed, or
enabled. No domain, DNS record, payment, refund, email, or external provider
object was created.** This is stop-gate 1 of the delivery sequence; it exists for
your review before any subsystem code is written.

- **Branch:** `feature/domain-registration` (base = deployed commit `39a28b8`)
- **Scope:** a high-risk **ownership + financial + lifecycle** subsystem, built
  provider-independently, sandbox-first, live purchasing disabled until you
  explicitly approve.

---

## 0. Provider & accredited registrar (accurate identification)

- **Reseller / management interface:** All Elite Cloud (a product of Faith Harbor
  LLC). **All Elite Cloud is NOT ICANN-accredited** and will never claim to be.
- **Chosen provider API:** **Namecheap** (you are supplying API credentials).
- **Accredited registrar of record:** **Namecheap** (an ICANN-accredited
  registrar). ⚠️ *To verify before publishing legal text:* the exact
  registrar-of-record entity for API registrations on your account (Namecheap vs
  its eNom back-end) and its IANA registrar ID — I will read this from the
  account/API during Stage 2 rather than assert it now.
- The legal terms (Stage 5) will name the accredited registrar accurately and
  describe All Elite Cloud strictly as reseller/management.

---

## 1. Ownership model (non-negotiable)

The **customer is the legal registrant and beneficial owner** of every customer
domain. All Elite Cloud is only the reseller and management console.

| Rule | How it is enforced in the design |
|---|---|
| Customer is registrant/owner | Registrant contact = the tenant's supplied details (§5); never Faith Harbor / AEC / an employee / an admin. |
| AEC is reseller only | We call the provider API; the accredited registrar holds the registration. No AEC-owned registrant record for customer domains. |
| Unlock & transfer away | Owner-only unlock + EPP/auth-code retrieval (§11) with reauth; no punitive barriers. |
| Cancellation ≠ loss of domain | Workspace/subscription cancellation does **not** surrender a paid, active domain. Domain billing/renewal is a **separate** lifecycle (§9). |
| Deletion ≠ loss of ownership record | Tenant/user deletion does **not** cascade-delete the registration/ownership record (§16 — deliberate exception to the platform's `ON DELETE CASCADE` norm). |
| Ownership ≠ hosting/email/subscription | Registration status is tracked separately from DNS, hosting, email, and SaaS entitlement everywhere (separate tables + separate states). |

---

## 2. Provider-independent architecture — `DomainRegistrarProvider`

A single interface isolates the registrar so Namecheap can later be swapped
without touching the platform. Namecheap is the **first adapter**; a
`FakeRegistrarProvider` backs offline tests; a `DisconnectedRegistrarProvider`
(throws, mode-guarded) is the safe default, mirroring
`DisconnectedStripeSubscriptionGateway` (`StripeSubscriptionGateway.ts:74-103`).

Interface surface (each method may be `unsupported` where the provider/TLD lacks
it — never faked):

```
normalizeDomain, validateDomain            // IDNA/punycode + confusable defence (§3)
checkAvailability                          // advisory only
getRegisterPrice / getRenewPrice / getTransferPrice
detectPremium (+ exact premium price)
register / getRegistrationStatus (reconcile)
renew / setAutoRenew
getContacts / updateContacts
getNameservers / setNameservers
getDnssec / setDnssec                      // if supported
getRegistrarLock / setRegistrarLock
requestAuthCode (EPP)                      // secure, never logged
initiateInboundTransfer / getTransferStatus
getExpiry / getRedemptionState
getRegistrantVerificationStatus
parseWebhook (where the provider offers events)
```

**Credentials are server-side only.** They are never returned through any API,
HTML, log, error, audit row, health output, or support screen. Config is read in
`platformServer.ts` (names only): `NAMECHEAP_API_USER`, `NAMECHEAP_API_KEY`,
`NAMECHEAP_USERNAME`, `NAMECHEAP_CLIENT_IP`, `NAMECHEAP_API_BASE`, plus a hard
mode guard `DOMAIN_REGISTRAR_MODE` (`sandbox`|`live`) and a kill-switch
`DOMAIN_PURCHASING_ENABLED` (default **false**).

> Namecheap requires the calling **egress IP to be whitelisted** in the account's
> API settings. I will determine the server's actual outbound IP during Stage 2
> and give it to you to whitelist (candidates: `192.227.127.13` / `.69`).

---

## 3. Normalization & availability (input is hostile)

- **IDNA/Punycode (new — no current support; both existing validators are
  ASCII-only, `OrganizationDomain.ts:58-59`).** Store **both** the canonical
  ASCII (`xn--…`) form and a display Unicode form. Purchase always keys off the
  ASCII form and shows it before payment.
- Reject malformed names, unsupported TLDs, control chars, invalid/over-long
  labels, embedded schemes/paths, and any header/log-injection payload.
- **Confusable defence:** flag mixed-script / confusable homoglyphs; show ASCII
  form prominently.
- Availability is **advisory** and carries a short **quote expiry** (§4). We
  **re-check availability and final provider price immediately before purchase**,
  and never reserve or promise a domain until the registrar confirms. We never
  auto-substitute a different domain or TLD.

---

## 4. Pricing, quotes & disclosure (never trust the browser)

A durable **quote** record (§16 `domain_quotes`) captures: provider, domain
(ASCII+display), tld, currency, **wholesale** register price, **customer**
register price, renewal price, transfer price (when relevant), premium status +
exact premium price, period (years), taxes/fees if any, created-at, **expires-at**,
and a **pricing-rule/version id**.

- **Markup = plan-tiered** (your choice). Implemented as `domainMarkupBps` per
  plan tier in `Plan.ts` (basis points; higher tiers get better "reseller"
  pricing) + a pure `domainPriceCents(costCents, plan)` helper. Proposed default
  markups (tunable, for your sign-off): Essentials 30% · Professional 25% ·
  Business 20% · Partner 10% · Enterprise 5%.
- The **price charged is always the server-stored quote price**; a browser-supplied
  amount/price/quote is never trusted (mirrors `BillingService.ts:276-277`).
- Checkout disclosure shows separately: first registration charge; period; **the
  expected renewal price** (never presenting an intro price as the renewal price);
  premium status; the auto-renew choice; refund limits; the reseller/registrar
  roles; required registrant verification; and transfer/expiration consequences.

---

## 5. Registrant data & encryption at rest (greenfield)

Collect **only** the registrant/admin/tech/billing fields the registrar/TLD
requires. Validate + normalize server-side.

**Encryption at rest is NET-NEW — nothing exists** (confirmed;
`docs/04_SECURITY.md:143-145` notes the KMS decision is still open; the closest
prior art is one-way scrypt password *hashing*, not reversible encryption).
Proposed design:

- **AES-256-GCM envelope encryption** using Node `crypto` (already available,
  currently unused). The full registrant-contact set is serialized to JSON and
  stored as a **single ciphertext blob**, not per-field columns.
- Ciphertext is a self-describing string `v1:<keyVersion>:<iv>:<authTag>:<ct>`
  (base64 parts). Columns: `contact_ciphertext TEXT`, `enc_alg TEXT` (`aes-256-gcm`),
  `key_version INT`.
- Keys come from env, **versioned for rotation**: `DOMAIN_CONTACT_ENC_KEY_V1`,
  `…_V2`, … + `DOMAIN_CONTACT_ENC_KEY_ACTIVE_VERSION`. Decrypt selects the key by
  the row's `key_version`; rotation re-encrypts on next write (or via a bounded
  maintenance job). No key ever appears in logs/audit/errors/health.
- Registrant PII is **never** placed in audit metadata or ordinary logs, **never**
  crosses tenants, and is visible/editable only to explicitly authorized roles
  (§12). WHOIS **privacy/proxy** is offered **where the TLD/provider supports it**
  — we do **not** claim privacy for every TLD, and we explain that required
  registry/registrar disclosures vary by TLD.
- Customer domain-contact data is **never** used for marketing without separate
  affirmative consent.

---

## 6. Purchase saga & financial ordering (durable state machine)

Not a synchronous controller — a durable saga (§17 worker) with explicit states:

`quoted → payment_pending → paid → registration_queued → registration_processing
→ registered` with branches `registration_failed`, `registration_unknown`,
`refund_pending`, `refunded`, `needs_attention`, `canceled`.

**Chosen financial ordering: charge-first (capture on confirmed payment), then
register, then refund only on definitive failure.**

1. **Quote** (server-stored, expiring).
2. **payment_pending:** Stripe one-time Checkout bound to the tenant + quote
   (§7). Capture happens on Stripe's confirmed `checkout.session.completed`
   webhook — **never** on the browser return.
3. **paid → registration_queued:** the webhook transitions the order and enqueues
   registration. **No registrar call happens until payment is captured.**
4. **registration_processing:** a durable worker (§17) submits to the registrar.
5. Terminal outcomes:
   - **registered:** registrar confirmed. Only now is the domain "secured."
   - **definitive failure:** auto-open **refund_pending → refunded** (only after
     Stripe confirms the refund).
   - **timeout/ambiguous → registration_unknown:** **never blind-retry**;
     reconcile via provider order/domain lookup (§17). Refund **only after**
     reconciliation proves the domain did **not** register.
   - **registered but DNS/hosting step fails:** keep the registration; mark
     **provisioning** separately as `needs_attention`. **Never** refund or discard
     an owned domain because provisioning failed.

**Why this cannot create an unpaid registered domain or a paid-but-unreconciled
silent failure:**
- *No unpaid registered domain:* the registrar is called **only** after payment
  capture is confirmed by webhook; registration is impossible pre-payment.
- *No silent paid failure:* every `paid` order is driven by a durable worker to a
  terminal state — `registered`, `refunded` (definitive failure), or surfaced to
  a restricted **admin reconciliation queue** for `registration_unknown` /
  `needs_attention`. Nothing is left in limbo.

**Idempotency & concurrency:**
- One **idempotency key per (tenant, canonical-ASCII-domain, attempt)**.
- A **DB unique constraint** prevents two *active* purchase attempts registering
  the same domain for the same tenant (partial unique index on active states).
- Safe against repeated browser submits, Stripe/provider webhook replays, worker
  retries, concurrent workers, and restarts (lease + `FOR UPDATE SKIP LOCKED` +
  `ON CONFLICT DO NOTHING`, per the existing dispatch template).
- **No DB lock is held while calling Stripe or the registrar** — claim row →
  release → call external → update (matches `LeadMagnetDispatchService`).
- Immutable provider-attempt history stores only sanitized ids + status enums.

---

## 7. Stripe integration (reuse existing conventions)

- Add a **one-time** `createOneTimeCheckout(input)` sibling to the platform gateway
  (`StripeSubscriptionGateway.ts:46-68,128`), copying `createSubscriptionCheckout`
  but `mode:"payment"` with a non-recurring `unit_amount` taken **only** from the
  server-held quote; bind `client_reference_id`/`metadata[quoteId]` +
  `metadata[organizationId]`. `DisconnectedStripeSubscriptionGateway` implements it
  too (throws when unconfigured).
- **Never** accept a client-supplied amount, tenant id, quote price, provider id,
  or owner id. Completion binds to the **stored** quote/tenant, not event metadata.
- Reuse the existing `/webhooks/stripe` route unchanged (`createPlatformApp.ts:329`,
  `express.raw` before `express.json`), the HMAC-SHA256 `verifyWebhook`
  (`StripeSubscriptionGateway.ts:265`), and `beginEvent` dedup
  (`ProcessedEventsRepository`, `stripe_processed_events`). Add a
  `checkout.session.completed` sub-branch keyed on the presence of `quoteId`
  metadata → a new fulfillment method modeled on `applyCheckoutCompleted`.
- Integer **cents** throughout; exact currency. **Refund path is net-new** (none
  exists) — server-authorized, audited, idempotent (`/v1/refunds` + a
  `charge.refunded` reconcile branch).
- Domain charges are labeled/kept **separate and understandable** from SaaS
  subscription charges.

---

## 8. DNS & nameservers (only after confirmed registration)

- **Never** change DNS/nameservers before registration is confirmed. Registration
  status and DNS/provisioning status are **separate** columns/states.
- After confirmation, offer explicit choices: **All Elite Hosting nameservers** ·
  **registrar-default DNS** · **custom nameservers** (validated server-side). Do
  **not** assume hosting or email is wanted.
- **Hosting attach (your ask):** optionally link the domain to a
  `hosting_accounts` row (today associated only by a free-text `domain` string;
  a stronger `domain_id`/`hosting_account_id` link is a small new addition) and
  point DNS at the site. Existing records are preserved on edit unless the
  customer explicitly authorizes replacement; destructive replacement requires
  confirmation. Propagation messaging is honest (never "instant"). DNS changes are
  audited without logging record contents unnecessarily; host-header/tenant
  crossover is defended.
- Integrates with the existing `OrganizationDomainService.add()/verify()/resolve()`
  so a registered domain becomes a routable white-label domain (auto-verified
  since we control it).

---

## 9. Renewal / expiration / redemption lifecycle

- Durable handling for auto-renew opt-in/out, renewal-price disclosure, manual
  renewal, provider renewal status, failed renewal, upcoming expiry, expired,
  grace, redemption (+ fees), pending-delete, successful renewal, and transfer
  states. **Grace/redemption periods are TLD/registrar-specific — never
  hard-coded**; read from provider data.
- **Auto-renew requires explicit customer choice**, stored with timestamp, actor,
  and the applicable terms/pricing version.
- **A failed SaaS subscription payment must not cancel or surrender a separately
  paid domain.** Domain renewal billing is defined and charged separately.
- Scheduled, **idempotent, de-duplicated** reminders at 60/30/14/7/3/1 days before
  expiry (where provider data supports), plus renewal success/failure + status
  notices — sent transactionally via `EmailDeliveryProvider`
  (`messageClass:'transactional'`, `logicalId: domain-expiry:<id>`), following the
  magnet/confirmation send pattern.

---

## 10. ICANN / registrar-required workflows

Surface honestly: registrant email verification + deadlines/suspension
consequences, required agreements, registrant-rights notices, transfer
locks/eligibility, EPP/auth-code handling, change-of-registrant confirmation,
provider/TLD-specific requirements, and abuse/contact processes. **EPP/auth codes
are never shown in lists, logs, audit, email previews, or support search** — they
require reauth + an explicit owner action to reveal/deliver securely (§11).

---

## 11. Transfers

- **Outgoing:** owner-only (or specifically authorized admin) + recent reauth →
  eligibility check → unlock → auth-code request → **secure one-time display or
  delivery** → audited **without storing the raw code** → clear lock/timing
  explanation. No artificial barriers.
- **Incoming (optional):** a **separate** state machine with price + renewal
  effects, auth-code security, status polling, and failure reconciliation.

---

## 12. Tenant isolation & authorization (fail-closed)

Every domain, quote, order, contact, payment binding, provider attempt, renewal,
DNS config, notice, and support action is tenant-scoped via
`TenantScopedRepository.tenantId()` (= fail-closed `requireTenant()`), stamped
from context, never the caller. Provider/Stripe webhooks bind to the **stored**
tenant/quote, never untrusted metadata.

**Proposed role matrix (for your approval):**

| Action | owner | admin | member |
|---|---|---|---|
| Search / quote | ✅ | ✅ | ✅ |
| View domain list (no PII) | ✅ | ✅ | ✅ (read-only) |
| **Purchase / register** | ✅ | ✅¹ | ❌ |
| DNS / nameserver edit | ✅ | ✅¹ | ❌ |
| View/edit registrant contact (PII) | ✅ | ✅¹ | ❌ |
| Auto-renew change | ✅ | ❌ | ❌ |
| Registrar unlock / EPP reveal / transfer | ✅ (+reauth) | ❌ | ❌ |

¹ Admin inclusion is a **documented policy choice**; the spec's default is
owner-only. Tell me if you want purchase/DNS/contact locked to **owner-only**.
Ownership-sensitive actions (unlock, EPP, transfer, auto-renew, destructive DNS)
default to **owner-only + reauth** regardless. Platform-admin access is
support-scoped and audited.

Isolation tests (§18) cover cross-tenant read/write denial, forged tenant/org/order
ids, host/forwarded-host spoofing, and webhook tenant binding.

---

## 13. Audit, logs & secrets

Reuse the append-only, **PII-free** audit tables (`audit_events` tenant-scoped;
`platform_audit_events` neutral) — compact `action` + `target_id` + `outcome`
enums only. **Never** log/audit: registrar creds, Stripe secrets, full registrant
data, postal addresses, raw EPP/auth codes, raw webhook PII payloads,
payment-method data, session tokens, full provider error bodies, or encryption
keys. Provider errors are sanitized to `{category, providerCorrelationId,
attemptId, status}`. A restricted platform-admin support view exposes
`registration_unknown`, `refund_pending`, `needs_attention`, transfer/verification
problems, and renewal failures.

---

## 14. Legal acceptance

Add a **new** legal kind `domain-registration` (extend `LEGAL_KINDS` +
`LEGAL_KIND_META`) with **versioned, immutable** acceptance evidence recorded
**before purchase** (kind + exact version + user + org + ts + ip + source),
following `LegalAcceptanceService`. The terms cover: customer-is-registrant;
AEC-is-reseller; the accredited registrar's identity; availability-not-guaranteed;
registration + **renewal** pricing; premium domains; auto-renew consent;
ICANN/registry verification; refund limits after successful registration;
expiration/redemption/deletion risk; customer responsibility for accurate contact
data; DNS/third-party limits; transfer rights; abuse/suspension/lawful-use; and
privacy + required data sharing with registrar/registry.

**The document stays UNPUBLISHED (draft) and blocked from production purchase**
until the provider relationship and attorney/owner review are complete. The
server-side `LegalMarkerError` publish guard blocks INTERNAL/LEGAL REVIEW
REQUIRED/TODO/PLACEHOLDER markers, so drafts cannot be published by accident.

---

## 15. UI & accessibility

An accessible **domain workspace**: search → availability/price (with quote
expiry) → registrant/contact form → review-and-confirm → terms acceptance →
payment status → registration progress → active-domain list → expiry/renewal
status → auto-renew control → nameserver/DNS management → contact management →
transfer management → verification/action-required notices → support/escalation.
Every state handled honestly (loading/empty/unavailable/validation/payment-failed/
registration-failed/registration-unknown/refund-pending/expired/renewal-failed/
provider-unavailable). **WCAG 2.2 AA** where practical (semantics, labels, keyboard,
visible focus, status announcements, error summaries, reduced motion, responsive,
no color-only signaling). The UI **never** shows "Domain secured"/"Registration
complete" before provider confirmation.

---

## 16. Database & migrations (additive, idempotent)

Appended to `PostgresDatabase.initialize()` (the project's only migration
mechanism; `CREATE TABLE IF NOT EXISTS` + `ALTER … ADD COLUMN IF NOT EXISTS`),
TEXT ids/timestamps, `organization_id … REFERENCES organizations(id)`, per-tenant
indexes. Proposed tables:

`domain_quotes`, `domain_orders` (the saga), `domain_registrations` (ownership),
`domain_registration_contacts` (encrypted), `domain_provider_attempts`
(append-only), `domain_terms_acceptances`, `domain_renewal_settings`,
`domain_renewal_events`, `domain_dns_state`, `domain_lifecycle_notices`,
`domain_transfers`, `domain_support_actions`.

**Ownership-preservation exception (documented):** `domain_registrations` and its
ownership/reconciliation evidence use **`ON DELETE RESTRICT`/`SET NULL`, NOT
`CASCADE`**, on the org/user FKs — a deliberate departure from the platform norm,
because a domain is **external property** the customer owns. Deleting a tenant or
user must **not** delete proof of a live external registration; disposition
requires an explicit process. This is called out loudly in code + docs.

Uniqueness: a partial unique index enforcing **one active order per
(organization_id, ascii_domain)** across active saga states, plus natural-key
`ON CONFLICT DO NOTHING` idempotent enqueue for workers.

---

## 17. Workers & webhooks

Durable workers/outboxes for registration, reconciliation, refunds, renewal
checks, lifecycle notices, and provisioning — following the existing dispatch
template exactly: short DB claims, `lease_owner`/`lease_until` + `FOR UPDATE SKIP
LOCKED`, bounded retries with exponential backoff (`MAX_ATTEMPTS=5`), **no blind
retry after an ambiguous external result** (→ `registration_unknown`/
`delivery_unknown`), graceful `beginShutdown()`, restart recovery (expired leases
→ ambiguous, reconciled not resent), multi-worker safety, PII-free health,
dead-letter/`needs_attention`, and webhook signature verification + replay dedup.
**All domain workers stay disabled or sandbox-bound until explicit production
approval** (`DOMAIN_PURCHASING_ENABLED=false` default + `DOMAIN_REGISTRAR_MODE`
guard).

---

## 18. Test matrix (deterministic, offline via FakeRegistrarProvider + fake Stripe)

Availability found/taken; quote expiry; price change between search and purchase;
premium; unsupported TLD; Unicode/Punycode; malformed/confusable; duplicate/
concurrent purchase; Stripe-ok+registrar-ok; Stripe-fail; Stripe-ok+registrar
definitive-fail+refund; Stripe-ok+registrar-timeout+later-reconcile-ok;
registrar-timeout+reconcile-fail→review; provider webhook replay; Stripe webhook
replay; worker crash before external call; worker crash after possible provider
acceptance; restart recovery; no-blind-retry of uncertain registration;
registration-ok+DNS-provisioning-fail; cross-tenant isolation; role restrictions;
registrant encryption + response redaction; logs/audit contain no secrets/PII;
auto-renew opt-in/out; renewal success/failure; deduped expiry notices; transfer
unlock/auth-code protection; **cancellation does not surrender a domain**;
**tenant deletion does not delete ownership evidence**; provider creds never reach
the client; sandbox/live-mode guard. Plus safe **sandbox contract tests** against
Namecheap (no live paid registration without separate approval).

---

## 19. Production environment variables required (names only — never values)

- Registrar: `NAMECHEAP_API_USER`, `NAMECHEAP_API_KEY`, `NAMECHEAP_USERNAME`,
  `NAMECHEAP_CLIENT_IP`, `NAMECHEAP_API_BASE`, `DOMAIN_REGISTRAR_MODE`
  (`sandbox`|`live`), `DOMAIN_PURCHASING_ENABLED` (default `false`).
- Payment (existing): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- Encryption: `DOMAIN_CONTACT_ENC_KEY_V1` (+ future `_V2`…),
  `DOMAIN_CONTACT_ENC_KEY_ACTIVE_VERSION`.
- DNS provisioning: `DOMAIN_PLATFORM_NAMESERVERS` (All Elite Hosting NS hostnames).

Plus the egress IP whitelisted at Namecheap, and (for live) a funded Namecheap
account + production-API unlock.

---

## 20. Gaps to build from scratch (flagged, not assumed)

1. **Encryption at rest / key management** — none exists (`docs/04_SECURITY.md`).
   Greenfield AES-256-GCM + versioned keys (§5).
2. **IDNA / punycode + confusable defence** — none exists; both current domain
   validators are ASCII-only (§3).
3. **DNSSEC** — none exists; optional, provider-gated (§2/§8).
4. **Refund path** — none exists in the codebase; net-new, server-authorized (§7).
5. **Registration↔hosting hard link** — today only a free-text `domain` string;
   a `domain_id`/`hosting_account_id` link is a small addition (§8).
6. **One-time Stripe charge** — the platform gateway is subscription-only; add a
   `mode:"payment"` sibling (§7).

---

## Delivery sequence & stop-gates (each stage: separate commit · typecheck ·
focused tests · production build · live purchasing disabled · no deploy)

1. **This report** ← you are here (STOP for review)
2. `DomainRegistrarProvider` interface + Namecheap **sandbox** adapter + offline
   contract tests
3. Additive schema + encryption/key model
4. Search + quote flow
5. Terms (unpublished) + registrant-contact flow
6. Stripe-bound purchase saga
7. Registration worker + reconciliation
8. DNS/nameserver provisioning (+ hosting attach)
9. Renewal/expiration lifecycle
10. Transfers
11. Admin support/reconciliation UI + domain workspace UI
12. Full browser + deterministic acceptance tests
13. Exact-final-commit Linux CI + consolidated pre-deployment report → **STOP for
    your explicit deployment/live-activation approval**

---

## Decisions I need from you before Stage 2

1. **Markup numbers** — confirm/adjust the per-tier defaults in §4.
2. **Role policy** — purchase/DNS/contact as **owner+admin** (proposed) or
   **owner-only** (spec default)?
3. **WHOIS privacy** — free where supported (your earlier choice) — confirmed;
   I'll clearly mark TLDs where privacy is unavailable.
4. **Incoming transfers** — include in v1 (you chose "full suite"), confirmed.
5. **Namecheap sandbox creds + egress IP whitelist** — needed to begin the
   sandbox adapter's live contract tests (I can build + offline-test the adapter
   without them and add the sandbox proof once provided).

## GO / NO-GO

- **Proceed to Stage 2 (build the provider interface + Namecheap sandbox
  adapter): GO**, pending your answers above. No production action, no live
  purchasing, no deploy — sandbox-first, stop-gated.
- **Live activation / real registration / deploy: NO-GO** until the full sequence
  completes and you explicitly approve.

**Nothing has been built or changed beyond this document. Stopping here for your
review.**

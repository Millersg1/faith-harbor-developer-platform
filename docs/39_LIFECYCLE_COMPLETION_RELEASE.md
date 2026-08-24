# 39 — Credential-Free Lifecycle-Completion Release (consolidated report)

Branch `feature/domain-registration`. Six owner-approved items built as separate
commits while NameSilo OTE credentials are pending. **Everything is
sandbox/test-only: provider mutations disabled, email captured (never sent),
nothing deployed, no live NameSilo/Stripe requests, production public schema
untouched (verified 74 tables before and after every disposable-PostgreSQL
proof).** Stage 12A external OTE testing remains HELD pending owner-provisioned
sandbox credentials.

## What shipped

| # | Commit | What |
|---|--------|------|
| L1 | `a4ab361` | Automatic-renewal scheduler |
| L2 | `8c37378` | Provider-fact-driven lifecycle + reminder scanner |
| L3 | `ccd8f86` | Durable notice delivery worker (captured transport) |
| L4 | `1204ffb` | Fair, rate-limited, read-only provider-fact sync |
| L5 | `bcbeb85` | Redacted cross-tenant platform-admin ops queue |
| L6 | `493d819` | Endpoint rate limiting + PII-free health + runbook |

### L1 — Automatic-renewal scheduler
Durable scanner (`DomainAutoRenewScheduler`) that finds registrations eligible for
auto-renewal and invokes the existing customer-funded renewal-creation service.
Eligibility requires ALL of: active registration, auto-renew explicitly enabled, a
saved off-session payment-method reference, a FRESH provider-confirmed expiration,
the expiry within the configured window, and no blocking condition (in-flight
transfer / needs_attention / dispute). Claims use `FOR UPDATE SKIP LOCKED`; each
item runs inside `runWithTenant(item.org)`; the DB uniqueness index is the final
duplicate guard (a duplicate simply converges). A stale provider sync DEFERS (never
guesses); a missing/declined payment method raises an ACTION-NEEDED notice and does
NOT attempt a registrar renewal. The registrar's own balance auto-renew is never
enabled. Runs in `full` mode only, disabled by default.

### L2 — Lifecycle & reminder scanner
Pure `lifecycleClassifier`: a positively provider-reported registry lifecycle
(grace / redemption / pending-delete / released / transfer / action) ALWAYS wins;
only when the provider reports nothing do we derive a REMINDER state from the
provider-confirmed expiry + configured windows. It NEVER invents grace, redemption,
deletion, or restoration deadlines. `DomainLifecycleScanner` records the observation
and enqueues the mapped (deduped) reminder; a provider transport failure marks the
state STALE and never overwrites a confirmed fact. Current state in
`domain_lifecycle_state`; transitions append to the immutable
`domain_lifecycle_events` history. Runs in `reconcile_only` + `full`.

### L3 — Notice delivery worker
`DomainNoticeWorker` over the outbox with the four honest SMTP classifications:
accepted (relay acceptance, NOT a delivery guarantee), rejected (terminal),
pre_acceptance_failure (retry with capped backoff → terminal at the bound), and
uncertain (AMBIGUOUS acceptance → `delivery_unknown` HOLD, never blindly resent).
The ONLY wired transport is a captured sink that emits nothing; the recipient
resolver returns `null` (real transport + verified-contact resolution are deferred),
so notices are re-queued (kept alive), never terminally skipped, while sending is
disabled. Honest per-type copy (`renderNoticeByType`) promises no timing, claims no
delivery, invents no deadline. Append-only attempt history
(`domain_notice_attempts`); crashed `sending` leases recover to `queued`. Persisted
rows + history carry no address, subject, body, transcript, EPP, contact, or payment
data. Runs in `full` only.

### L4 — Provider-fact sync
`DomainSyncScanner`: strictly READ-ONLY provider polling, fair per-tenant claiming
(ROW_NUMBER window cap + `FOR UPDATE SKIP LOCKED`), throttled by per-provider /
tenant / platform token buckets (`TokenBucketRateLimiter`). Stores the last
provider-CONFIRMED facts (`domain_sync_state`); a successful refresh also updates the
registration freshness flag + provider-confirmed expiry (feeding L1). A failed
refresh flips `sync_state='error'` and bumps the streak but NEVER overwrites the
confirmed facts or `last_success_at` — stale data stays visibly stale, never
silently wrong. `dnssec` is only ever set from a provider-reported value.
`verificationRequired` is inferred only from provider-reported lifecycle. Runs in
`reconcile_only` + `full`.

### L5 — Platform-admin ops queue
A REDACTED, cross-tenant support surface (`/platform/admin/api/domain-ops/*` +
`/platform/admin/domain-ops` page) over the 10 categories of items needing platform
attention (registration/renewal/transfer/delivery unknown, needs_attention,
refund_failure, stale_sync, stuck_lease across every leased table, registrar_funding
[intentionally empty — no source, never fabricated], pending_owner_action). Every row
is minimum-necessary: category, opaque item ref, organization, coarse state,
timestamp — no domain name, price, contact, EPP, payment id, ciphertext, or raw
provider response. Actions are evidence-gated + append-only
(`domain_support_queue_actions`, distinct from the older order-scoped
`domain_support_actions`) behind a per-call reauth whose identity must match the
signed-in admin. READ-ONLY RECONCILIATION BEFORE RESOLUTION is enforced
(`mark_resolved` requires a prior logged reconciliation); there is NO retry/mutation
verb at all. Owners keep every right; support cannot change registrant / nameservers
/ contacts / privacy / consent / payment from here. The page is accessible (labelled
inputs, no horizontal overflow, XSS-safe) — verified in a real browser at desktop,
tablet, and phone with reduced motion.

### L6 — Rate limiting + health + runbook
Token-bucket rate limiting over the tenant search/availability/price, DNS-preview,
SetupIntent/auto-renew-setup, and sensitive transfer/unlock/auth-code/resolve
endpoints, per IP / user / tenant / platform. The limiter decides BEFORE any lookup,
so a 429 is existence-agnostic (fixed generic body + coarse Retry-After) and cannot
be used to probe whether a domain/order/contact exists. A PII-free health snapshot
(`/platform/admin/api/domain-ops/health`) exposes mode + disabled reason, worker
health, the queue category counts, unknowns total, notice depth by state,
oldest-open notice age, and threshold alerts (refund_failure critical). Runbook in
docs/38.

## Verification

- **Unit tests** (deterministic; time boundaries + idempotency): L1 6, L2 9, L3 15,
  L4 11, L5 7, L6 rate 4 + health 5, plus the support API 10 and coordinator 4.
- **Real-browser** (Playwright/Chromium, gated by `RUN_BROWSER_TESTS`): the ops-queue
  page passes at desktop / tablet / phone — no horizontal overflow, no uncaught JS,
  every input labelled, redaction notice present, live data via the admin cookie,
  reduced-motion.
- **Disposable real-PostgreSQL proofs** (compiled repositories against a throwaway
  schema on the live PG cluster; schema dropped + runner removed after; production
  `public` verified UNCHANGED at 74 tables each run):
  - L1 auto-renew 8/8 (incl. LITERAL child-SIGKILL lease recovery),
  - L2 lifecycle 9/9 (transition + immutable event, idempotent, stale-preserve,
    tenant isolation, child-SIGKILL recovery),
  - L3 notices 10/10 (dedup, global SKIP LOCKED claim, backoff window, requeue,
    append-only + tenant-isolated history, child-SIGKILL recovery),
  - L4 sync 10/10 (window-function fair per-tenant claim + SKIP LOCKED, success/
    failure fact preservation, requeue, child-SIGKILL recovery),
  - L5 support 10/10 (all categories surface, registrar_funding empty, redacted
    fields only, no domain-name leak, cross-table stuck-lease, category filter,
    counts, append-only per-item history),
  - L6 health 4/4 (cross-tenant notice grouping, oldest-open age ignoring terminal
    states, null when none open).
- **Typecheck (incl. test files)** clean; **build** clean.
- **Linux CI** on the exact final commit: see the branch run (authoritative;
  Windows full-suite has known fork/port-exhaustion flakes in unrelated HTTP suites).

## Still deferred / held (NOT built — require separate approval)

Registrant-email verification, change-of-registrant workflow, restoration/redemption
purchase, live premium-domain purchasing, cPanel DNS adapter, tax/multi-currency,
REAL email delivery, legal publication, production deployment or live provider
activation. Stage 12A external OTE testing stays HELD until the owner provisions
NameSilo sandbox credentials into the isolated local runner and `npm run
ote:preflight` reports READINESS: PASS.

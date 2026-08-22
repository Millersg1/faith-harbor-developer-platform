# Domain Registration — Stage 11 Pre-Deployment Acceptance Report

**Status: SANDBOX / TEST-ONLY. Nothing deployed, enabled, published, billed,
emailed, or run against live credentials.** Every dangerous mode is disabled by
default. Branch `feature/domain-registration`.

Stage 11 = production integration surfaces, still entirely test/sandbox-only,
delivered as separate reviewable commits:

| Commit | Part |
| --- | --- |
| `01b7ec2` | 11a — Stripe webhook boundary |
| `2db5809` | 11b — durable worker scheduling |
| `3913adb` | 11c — owner/admin domain workspace UI + API |
| `18632b1` | 11d — auto-renew authorization (Stripe SetupIntent) |
| `3a4a279` | 11e — legal disclosures (unpublished) + transactional notices |
| _this commit_ | 11f — consolidated report |

Standing restrictions remain in force: no deployment; no live Stripe or registrar
activity; no real registration/renewal/transfer/refund/DNS/nameserver/lock-unlock/
EPP/email/hosting mutation; no production credentials; no legal publication; no
cPanel adapter; every dangerous mode disabled by default.

---

## 1. Stripe webhook boundary (`01b7ec2`)

`POST /webhooks/stripe/domains` (`express.raw`, registered before `express.json`)
delegates to `DomainWebhookHandler`, which: bounds the body, verifies the
signature over the EXACT raw bytes BEFORE parsing (5-min tolerance rejects stale),
rejects missing/invalid/malformed/oversized and **live-mode** events, parses only
after verify, and routes by the SERVER-STORED checkout id (never client input)
across purchase/renewal/transfer channels. Each saga dedups on the event id
(`stripe_processed_events`) and **re-reads the PaymentIntent** to match the STORED
order (amount/currency/status) before capture, so duplicate/reordered/delayed
events converge and a **wrong amount/currency is flagged `needs_attention`, not
captured**. A processing error still acks 200. Browser success/cancel redirects
never reach this path. `buildDomainRuntime` assembles the runtime **fail-closed to
undefined** unless a `sk_test_` key + webhook secret + contact keyring are all
present; otherwise the endpoint returns `DOMAIN_WEBHOOK_DISABLED`.

**Tests:** handler unit (11) — real-HMAC valid/tampered-body/stale/missing
signature, live-mode rejection, routing, event-id replay dedup, wrong-amount not
captured, unknown checkout, unhandled type, malformed, oversized, channel-crash
acks 200; route (3) via supertest.

## 2. Durable worker scheduling (`2db5809`)

`DOMAIN_OPERATIONS_MODE` is the single fail-closed switch: missing/empty/invalid →
`disabled`. `reconcile_only` runs ONLY read-only reconciliation + expired-lease
recovery (no submission, no Stripe refund); `full` runs every pass.
`DomainWorkerCoordinator` ticks the registration/renewal/transfer workers; each
globally-claimed item is processed inside `runWithTenant(item.organizationId)`;
expired mutation leases become `*_unknown` and are never blindly resubmitted.
The `setInterval` (`.unref()`) exists ONLY when a runtime is configured AND the
mode is not disabled; shutdown clears the timer then `beginShutdown()`s. Timers
live only in the server `start()`, never in `createPlatformApp`, so tests drive
`runOnce()`/`runTick()` directly. Health is surfaced on `/system-health` and is
PII-free (modes, counts, timestamps, derived tick-age, coarse reason enum).

**Tests:** mode unit (5) + coordinator behavior (4). **LITERAL child-process
crash proof on disposable PostgreSQL (12/12):** for each of the 5 crash windows a
child claims the lease, is SIGKILLed mid-mutation, the lease expires, and the
parent recovers — registration/renewal/transfer → `*_unknown` (never
resubmitted); refund/reconcile → re-claimable (idempotent). Multi-worker claim
exclusivity (concurrent `FOR UPDATE SKIP LOCKED`) was proven for every repo in
Stages 7/9/10.

## 3. Owner/admin domain workspace (`3913adb`)

`domainOpsRouter` (mounted under `/api/platform` behind CSRF + `requireUser`)
covers search/transparent pricing, registration status + provider-sync freshness,
registrant-contact history, DNS authority + record preview/apply (protected-record
409), nameserver mode, DNSSEC, hosting attach (no NS/DNS mutation), manual
renewal, auto-renew, incoming transfer, outgoing unlock + auth-code, and
unknown-state resolution. **Permissions:** OWNER-ONLY + recent reauth for
purchase/contacts/auto-renew/incoming-transfer/unlock/auth-code/resolve;
OWNER/ADMIN for DNS/nameservers/DNSSEC/renewal/hosting; members read-only;
unauthenticated 401. "Recent reauth" is proven **per-call** (`reauthPassword`
verified via `users.authenticate` in the session tenant). Cross-tenant ids **fail
closed (404)**; the client never supplies tenant/provider/wholesale/markup/
currency/status/NS-ownership/outcome. A returned auth code is sent
`no-store`/`no-referrer` and never persisted. `domainsPage()` (`/app/domains`) is
an accessible shell with skip link, `main` landmark, headings, labelled controls,
`aria-live` status, focus-visible, responsive layout, honest copy, and
`textContent` rendering.

**Tests:** route (6) — unauth 401, owner list/search, member write 403 + read
200, sensitive action requires reauth, cross-tenant 404, page served.
**Real-browser acceptance (Chromium, `RUN_BROWSER_TESTS`) — 3/3:** landmarks,
labelled search, `aria-live`, skip link is first focusable, visible keyboard
focus, and **no horizontal overflow at desktop/tablet/phone widths** under
reduced-motion.

## 4. Auto-renew authorization — Stripe SetupIntent (`18632b1`)

`createSetupIntent(usage=off_session)` + `getSetupIntent` (test mode). The saga's
`beginAutoRenewSetup` (owner+reauth → client secret) and `confirmAutoRenewSetup`
confirm the SetupIntent **succeeded and yielded a saved method**, record
**IMMUTABLE consent evidence** (`domain_autorenew_consents`: Stripe ids +
terms/pricing versions + mandate-text hash — **never card data**), then enable
auto-renew. If setup did not yield an eligible method → `AutoRenewNotAuthorized`
(fallback to checkout/manual). **An existing subscription payment method is NOT
accepted** as renewal authorization — only a method authorized through this flow.
The **renewal price is rechecked before each off-session charge**; **NameSilo
registrar-balance auto-renew stays disabled** (saga calls only the one-time
`renew()`). The client never supplies a payment method directly; disabling
auto-renew only flips the flag.

**Tests:** SetupIntent flow (5) — reauth gate, immutable consent (Stripe ids only,
no PAN/CVC) + enable, post-auth off-session recharge with fresh recheck,
incomplete-setup fallback, append-only consent history. **Consent table
disposable-PG (8/8):** append-only, no card-data columns, tenant isolation,
registration+org `RESTRICT`, public unchanged at 74.

## 5. Legal disclosures + transactional notices (`3a4a279`)

The UNPUBLISHED domain-registration terms draft was extended with the remaining
disclosures — automatic-renewal authorization, DNS & nameserver management, and
transfers-away — joining the existing registration/renewal/refund/registrant-
accuracy/transfer sections. Every section keeps `LEGAL REVIEW REQUIRED` markers;
the server-side publish guard refuses to publish while any marker remains. No
existing immutable Version-1 document is modified and no new legal kind is
registered (public legal index unchanged). `domainNoticeTemplates` renders honest,
distinct transactional copy for requested/paid/submitted/registered/renewed/
transferred/refunded/unknown/needs_attention; "submitted" never claims
completion, "unknown" states we reconcile read-only and neither retry nor refund
until confirmed, no propagation/transfer/renewal TIME is promised, and server
acceptance is never called "delivery".

**Tests:** notices (5) via a **captured** `EmailDeliveryProvider` (no real send,
transactional, no unsubscribe headers) + a forbidden-timing guard; legal (3) —
disclosures present with markers, publish guard REFUSES (`LegalMarkerError`, never
published), other kinds untouched.

---

## 6. Acceptance — full evidence

- **Additive, idempotent migrations only:** new `domain_autorenew_consents`; all
  other schema unchanged. Double-`initialize()` is a no-op.
- **Route/service/repository tests** for owner/admin/member/unauthenticated/
  cross-tenant cases (webhook + ops routers).
- **Real-browser acceptance** at desktop/tablet/phone with keyboard navigation,
  focus visibility, screen-reader labels/`aria-live`, reduced-motion, no overflow,
  and safe error recovery (honest "not enabled" path).
- **Actual compiled repositories against disposable PostgreSQL** — this stage:
  child-process crash 12/12, consent table 8/8; prior stages: saga 24/24, DNS
  18/18, renewal 22/22, transfer 25/25. **Production `public` schema verified
  unchanged at 74 tables in every run; disposable schemas dropped and all server
  artifacts removed.**
- **Literal child-process termination tests** for registration, renewal, transfer,
  refund, and reconciliation crash windows — all recover safely.
- **Domain-registration subsystem:** 264 passed, **0 real failures** (the 6
  non-passing are 3 gated browser tests skipped without `RUN_BROWSER_TESTS` + 3
  contract tests skipped by design).
- **Typecheck incl. tests: clean (0 errors). Production build: clean.**
- **Full Windows suite:** 1709 passed; the 17 non-passing are all in UNRELATED
  HTTP integration suites (AuthRouter, calendar, forms, invoice-paid,
  TicketRouter, storefront, privacyRoutes) — the Windows fork-exhaustion flake,
  0 domain-related. Linux CI runs them clean.
- **Linux CI on the exact final commit (authoritative): GREEN** — "Validate
  Faith Harbor OS" run `32590766251` at `01b5b39` ran the complete validate
  (typecheck of `src/**/*.ts` including all test files, full vitest suite, and
  production build) to success. This confirms the Windows full-suite failures
  above were environmental (every one passes on Linux).

**Windows full-suite note:** the Windows parallel fork runner is unreliable under
load (unrelated HTTP integration suites crash with `STACK_TRACE_ERROR`/
`ECONNRESET`); those pass in isolation and on Linux. Linux CI is authoritative.

---

## 7. Deferred (NOT begun — awaiting approval)

Live-provider OTE mutation testing; Stage 12 deployment; the cPanel DNS adapter;
enabling any dangerous mode; publishing legal documents; real email send; live
Stripe/NameSilo credentials. The webhook/workers/UI/SetupIntent are all wired but
inert unless a test-mode runtime is explicitly configured.

## 8. Residual risks

No live-provider proof yet (fake + real-PG persistence only); the SetupIntent
mandate/consent flow is proven test-mode + immutable-evidence, but the browser
Elements confirmation is exercised only via the Fake gateway; worker scheduling is
proven at the repo + crash-window level, not yet under sustained production load.

## 9. GO / NO-GO

**GO** to keep Stage 11 integration surfaces committed on-branch as sandbox/
test-only. **NO-GO** for any enablement/deployment/live-provider testing
(unchanged). Recommended next gate: NameSilo OTE credentials + explicit approval
to begin sandbox live-provider verification, then Stage 12 deployment planning.

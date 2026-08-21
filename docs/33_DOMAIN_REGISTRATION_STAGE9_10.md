# Domain Registration — Stages 9 & 10 Pre-Deployment Report

**Status: SANDBOX / TEST-ONLY. Nothing deployed, enabled, live, or billed.**
Branch `feature/domain-registration`.

Commits in this delivery (separate, reviewable):
- `d87ffb5` — Stage 8 DNS **boundary reconciliation** (authority gate).
- `8a55e6e` — Stage 9 **renewals**.
- _(this delivery)_ — Stage 10 **transfers** + this consolidated report.

Standing restrictions remain in force and unchanged: purchasing/renewals/transfers
disabled; Stripe test mode only; fake registrar + NameSilo sandbox/OTE only; no
live Stripe operation; no production NameSilo mutation; no real domain
registration/transfer/renewal/restoration/DNS change; no legal publication or
marker removal; no production key provisioning; no email send; no deployment.

---

## §0 — Linux CI on the exact tip

Pre-work item 1 confirmed on the *exact* commit `cafc1c9` (the Stage 7/8 tip):
CI run `32310383270` (event: push) ran the complete workflow — Node 24,
`validate = typecheck && test && build`, all steps success. It was **not** an
inheritance of `9ad066b`'s result. The final commit of THIS delivery is likewise
run on Linux CI (see §CI).

---

## §Stage 8 boundary reconciliation (commit `d87ffb5`)

Corrected the Stage 8 gap where record mutation did not check DNS authority. Now:
registrar nameserver delegation, registry DS/glue (DNSSEC read-only), and
authoritative zone-record management are **separate**; zone-record mutation is
gated on a **freshly-verified** managed authority (`verifyAuthority` reads the
live nameservers and classifies them via an injected provider→NS-suffix map);
cPanel/All-Elite-Hosting domains are `externally_managed` (record mutation
refused) until a dedicated cPanel adapter exists; nameservers are never
auto-switched; hosting attach touches neither nameservers nor records. Deterministic
tests + disposable-PG proof (18/18). Full detail in docs/32.

---

## §Stage 9 — Renewals (commit `8a55e6e`)

### Design
Renewal is a **separate billing lifecycle**. Manual (customer checkout) and
automatic (auto-renew) are separate entry points. Auto-renew is **opt-in, OFF by
default** and **customer-funded** off-session; a declined charge never captures
and never renews, so **All Elite funds never renew a domain**, and **NameSilo
registrar-balance auto-renew is never enabled** (the saga only ever calls the
one-time provider `renew()`; the interface exposes no auto-renew toggle to it).

### Safety invariants (all proven)
- Fresh authoritative **renewal** quote (`getRenewPrice`, never a promo reg
  price) before any checkout/off-session charge; registration/renewal/transfer/
  restoration prices stay separate; restoration remains fail-closed/unavailable.
- The renewal order binds domain, tenant, registration, term, provider, currency,
  provider price, customer price, pricing version, the **current expiration
  cycle**, and the terms acceptance.
- A DB partial-unique index prevents a duplicate renewal for the same
  (registration, expiration cycle, term).
- **Never renew before confirmed Stripe capture** (state machine: `renewing`
  only from `renewal_queued`, only from `payment_captured`). After capture, ONE
  idempotent provider renewal. Definitive failure → idempotent refund. Ambiguous
  → `renewal_unknown`, never blind-retried/auto-refunded until read-only
  reconciliation (did the provider expiry advance past the billed cycle?).
- Success **refreshes + persists the provider-confirmed expiration date**.
- Turning OFF auto-renew only flips the flag + drops the saved method — it never
  cancels, deletes, surrenders, unlocks, or transfers the domain.
- No universal grace/renewal-schedule promise; only provider-verified facts.
- Global workers claim GLOBALLY then process each item inside
  `runWithTenant(item.organizationId)`. Audit = ids + enums + amounts/currency +
  reason categories only.

### Files / schema
`renewal/renewalSagaState`, `DomainRenewalRepository`, `DomainRenewalSaga`,
`DomainRenewalWorker`. Stripe gateway gains `chargeOffSession` (test mode + fake).
`FakeRegistrarProvider` gains renew scripting + mutable expiry.
`DomainRegistrationRepository.setExpiry`. Additive schema:
`domain_renewal_orders` (+ duplicate-cycle partial unique, idem unique, PI
unique), `domain_renewal_refunds`, `domain_autorenew`; `domain_provider_attempts
+= renewal_order_id`.

### Evidence
Unit **16/16** (incl. a call-recording proof that registrar-balance auto-renew is
never toggled and that a declined off-session charge never calls `renew()`).
**Disposable real-PostgreSQL exercise of the compiled repo: 22/22** — query
shapes + computed markup, duplicate-cycle constraint, lease + concurrent
`FOR UPDATE SKIP LOCKED` (claimed exactly once), crash-lease recovery →
`renewal_unknown`, refund idempotency `ON CONFLICT`, auto-renew upsert +
default-off + tenant isolation, org/registration `RESTRICT`, autorenew `CASCADE`
(transient config), production public schema unchanged at 74. Disposable schema
dropped + artifacts removed.

---

## §Stage 10 — Transfers (this delivery)

### Incoming (a saga)
Owner-only + recent reauth; **disabled unless the explicit sandbox flag is on**.
A fresh transfer quote + **published transfer terms** are required before payment
(terms are unpublished in sandbox → the gate fails closed). The **EPP/auth code
is encrypted at rest** (envelope cipher, AAD bound to org+order+"epp"), **used
once, and destroyed** (ciphertext → NULL) after the single submission attempt or
a terminal state — proven at rest (`v1:` envelope, not plaintext) and after
destruction. The transfer is **submitted only after confirmed capture, exactly
once**; an ambiguous submission → `transfer_unknown` (no blind resubmit, no
auto-refund) resolved by read-only reconciliation. The domain's **current
nameservers are preserved** — a transfer never attaches hosting, replaces DNS, or
changes nameservers (asserted). We **never promise a bonus year**: the
verified provider expiry is persisted on completion. Refunds are idempotent and
depend on verified state. Registry/registrar timing is modelled honestly
(`transfer_pending` is a long poll with no guaranteed completion date).

### Outgoing (deliberate owner actions; not a saga)
Owner-only + reauth. **Unlock** and **auth-code request** are separate,
individually-confirmed actions. With NameSilo the auth code is **emailed to the
registrant and never returned via API** — the platform requests/displays/stores/
logs **no code it did not receive**; when a code IS returned it is handed to the
owner transiently and **never persisted** (proven: the returned code never
appears in the audit). Transfer-away is never obstructed; nothing implies All
Elite Cloud owns the customer's domain. Domain/registration records are preserved
on tenant/user deletion (RESTRICT; no cascade surrender).

### Provider surface
`RegistrarProvider` gains `setRegistrarLock` + `requestAuthCode` (+
`RegistrarMutationResult`, `AuthCodeResult`). The fake implements them fully;
NameSilo/Namecheap **fail closed** (live lock/unlock + auth-code wiring deferred
to OTE proof); Disconnected rejects.

### Files / schema
`transfer/transferSagaState`, `DomainTransferRepository`, `DomainTransferSaga`,
`DomainTransferWorker`. Additive schema: `domain_transfer_orders` (encrypted
`epp_ciphertext`, duplicate-active partial unique, idem unique, PI unique),
`domain_transfer_refunds`, `domain_outgoing_transfer_actions` (no code column);
`domain_provider_attempts += transfer_order_id`.

### Evidence
Unit **12/12** (state machine, flag/owner/terms gates, EPP encrypt-store-submit-
destroy, capture-before-submit, ambiguous→reconcile, rejected→refund, crash
recovery, duplicate-active, outgoing unlock/auth-code non-persistence, multi-tenant
isolation). **Disposable real-PostgreSQL exercise of the compiled repo: 25/25** —
EPP encrypted at rest + decrypt + destroy, computed markup, duplicate-active +
idem constraints, lease + concurrent `SKIP LOCKED`, crash recovery →
`transfer_unknown`, refund idempotency, attempt/outgoing audit (no code column),
tenant isolation, org/registration/transfer_order `RESTRICT`, public schema
unchanged at 74. Disposable schema dropped + artifacts removed.

---

## §Tests / CI

- **Domain-registration subsystem** (`src/platform/domains/**`): **223 passed, 0
  real failures** — Stage 9 renewal (16), Stage 10 transfer (12), Stage 8 DNS +
  authority (20), plus the existing registrar/saga/crypto suites. The only file
  the full run flagged, `namecheapContract.test.ts`, is **skipped by design**
  (needs live creds) and passes/skips cleanly in isolation.
- **Typecheck + build:** clean.
- **Full local (Windows) suite — honest note:** the Windows parallel fork runner
  is UNRELIABLE under full-suite load: several HTTP integration suites unrelated
  to domains (drip, portal, privacy, ai-allowance, createPlatformApp, …) crash
  with `STACK_TRACE_ERROR`/`ECONNRESET` when the fork pool is saturated and their
  workers are timeout-terminated on teardown. **Every flagged suite passes (or
  cleanly skips) when run in isolation** — verified for a representative sample
  (drip, privacyRoutes, BookRouter, ai-allowance = 41/41; namecheapContract =
  skipped). None touch registration/renewal/transfer code. This is the same
  Windows-only flake noted for prior stages.
- **Linux CI on the exact final commit (authoritative): GREEN** — "Validate
  Faith Harbor OS" run `32475205110` at `419d208` ran the complete validate
  (`typecheck && test && build`): typecheck of `src/**/*.ts` **including all test
  files**, then **vitest 1685 passed / 0 failed / 9 skipped (220 files)**, then
  build — all success. This confirms the Windows full-suite failures above were
  environmental (every one passes on Linux) and that Stage 9/10 is sound.
  (An earlier push, `0e537f7`, went red on a single test-file TS2352 — a
  `Record<string,unknown>` cast — fixed in `419d208`; no runtime change. That
  slipped past the local check because the Stage 10 typecheck predated the test
  file and vitest transpiles without typechecking.)

---

## §Deferred integration points (Stage 11+, NOT begun)

HTTP webhook routes (raw-body signature verification) for renewal + transfer
checkouts; scheduling the renewal/transfer workers on a tick; owner/admin UI+API
(incl. auto-renew consent, off-session authorization capture, transfer initiation,
outgoing unlock/auth-code); live NameSilo (then Namecheap) DNS + lock/unlock +
auth-code + renewal + transfer HTTP, proven first in OTE sandbox; a dedicated
cPanel DNS adapter; publishing transfer/renewal legal terms; transactional
renewal/transfer email notices.

---

## §Residual risks

- **No live-provider proof yet** — renewals/transfers are proven against the fake
  provider + real-PG persistence only; NameSilo OTE behaviour (ambiguous
  outcomes, Domain Defender gating on unlock/nameserver/transfer, auth-code
  email-only delivery, whether a transfer adds a year for a given TLD) is
  unverified until sandbox credentials exist.
- **Off-session authorization capture** (SetupIntent/mandate) is modelled behind
  a stored payment-method reference; the real Stripe SetupIntent + mandate flow
  lands with the Stage 11 UI.
- **Worker scheduling** is proven at the repository + unit level (expired-lease →
  unknown, tenant re-entry) but not yet under a real killed process.

---

## §GO / NO-GO

**GO** to keep the Stage 8-boundary/9/10 cores committed on-branch as
sandbox/test-only. **NO-GO** for any enablement/deployment (unchanged).
Recommended next gate: Stage 11 integration on explicit approval, with NameSilo
OTE credentials to convert docs-evidence capabilities into sandbox-verified ones
before any live path is contemplated.

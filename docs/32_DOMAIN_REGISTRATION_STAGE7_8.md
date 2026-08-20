# Domain Registration — Stages 7 & 8 Pre-Deployment Report

**Status: SANDBOX / TEST-ONLY. Nothing deployed, enabled, or live.**
Branch `feature/domain-registration`. Baseline: accepted Stage 6 (`845f5b7`);
Stage 7 = `9b4c90e`; Stage 8 = _this commit_.

Standing restrictions remain in force and unchanged: purchasing disabled; Stripe
test mode only; fake registrar + NameSilo sandbox/OTE only; no live Stripe
operation; no production NameSilo mutation; no real domain registration,
transfer, renewal, restoration, or DNS change; no legal publication or marker
removal; no production encryption-key provisioning; no email send; no
deployment.

---

## §1 — Honest Stage 6 status (unchanged)

Stage 6 remains **service-core complete; HTTP webhook + owner-management
integration pending.** The saga is not end-to-end operational until: an HTTP
webhook route is mounted and raw-body Stripe signature verification runs through
that route; owner reconciliation controls are reachable through an authenticated
UI/API; the real PostgreSQL repositories are exercised by the running service;
and process-restart/crash recovery is proven in the live process. Stages 7–8 add
the worker + DNS service cores and their **real-PostgreSQL repository proof**,
but the HTTP/UI wiring and in-process worker scheduling remain **Stage 11**.

---

## §2 — Restated scope (from docs/26), no redefinition

- **Stage 7 = registration worker + reconciliation.** A durable sequencer that,
  after payment capture, fulfils registration exactly once, recovers crashed
  attempts safely, and reconciles `registration_unknown` orders by READ-ONLY
  provider lookup — never a blind duplicate registration, never an auto-refund
  on ambiguity.
- **Stage 8 = DNS & nameservers, only after confirmed registration** (docs/26
  §8): nameserver mode (All Elite / registrar-default / custom, validated
  server-side); DNS record management with change preview, preservation of
  existing records, protection of mail/sender-auth/cert records, immutable
  PII-minimised change audit, read-only reconciliation, honest propagation
  messaging, and no auto-rollback promise; optional hosting attach via
  `domain_dns_state.hosting_account_id` with tenant/host-crossover defense;
  DNSSEC status.

**Dependency on deferred Stage 11:** both worker scheduling (a `setInterval`
tick in the server) and every DNS/owner action reaching a user require the
Stage 11 HTTP/UI/API integration. Stages 7–8 deliver the service + persistence
cores and their tests; they do **not** mount routes, schedule the worker, or
wire the white-label `OrganizationDomainService`. Live NameSilo/Namecheap DNS
HTTP is intentionally deferred (see §7).

---

## Stage 7 — files, transitions, permissions

### Files
- `saga/DomainSagaWorker.ts` (new) — single-tick sequencer (fulfillment → refund
  → reconciliation), cooperative `beginShutdown()`, PII-free heartbeat.
- `saga/DomainPurchaseSaga.ts` — `runReconciliationOnce()`, `reconcileClaimed()`,
  `recordAttempt()`, register-attempt audit, `markSync(reg,"fresh")`; **and the
  multi-tenant worker-isolation fix** (below).
- `saga/DomainSagaRepository.ts` — `recoverExpiredFulfillment()`,
  `claimUnknownForReconcile()`, `appendProviderAttempt()`, `listAttempts()`.
- `DomainRegistrationRepository.ts` — `markSync(state ∈ fresh|stale|unknown|
  needs_attention, at)`.
- `FakeRegistrarProvider.ts` — `throwOnStatus` (models a provider timeout).
- `PostgresDatabase.ts` — additive: `domain_registrations += last_provider_sync_at,
  sync_state`.

### State transitions (unchanged safety contract)
- `registering` + **expired lease** → `registration_unknown` (crash recovery;
  never re-registered).
- `registration_unknown` + provider says **registered** → `registered` with **no
  new registrar mutation**.
- `registration_unknown` + provider says **not registered** → `refund_queued`.
- provider **timeout/malformed** during reconcile → reschedule with backoff;
  after bounded attempts → `needs_attention`. Never fabricated as registered.

### Multi-tenant worker-isolation fix (surfaced by the real-PG exercise)
The `claim*` sweeps are intentionally **global** (one platform worker drains
every tenant's queue), but the per-order handlers use tenant-scoped repositories
that resolve `organizationId` from the **ambient** context. Each claimed order /
refund is now processed inside `runWithTenant(item.organizationId)`, so audit
rows, registration records, contact lookups, and order reads resolve to the
item's own org — never the ambient/first tenant. The worker can now run **outside
any ambient tenant** (a true cross-tenant sweep); previously that threw in
`recordAttempt`. Covered by a new multi-tenant isolation test.

### Permissions
Unchanged: purchase/owner-resolution are owner-only + recent-reauth
(`authorizeDomainAction`). The worker performs no privileged action beyond what
the saga already gates; reconciliation is read-only against the provider.

---

## Stage 8 — files, transitions, permissions

### Files
- `dns/dnsValidation.ts` (new) — pure validation (nameservers; A/AAAA/CNAME/MX/
  TXT/SRV/CAA/NS/ALIAS type rules; TTL bounds) + protection classification
  (MX / SPF / DKIM / DMARC / CAA / ACME / sub-delegation).
- `dns/DomainDnsRepository.ts` (new) — tenant-scoped, dual-mode: `domain_dns_state`
  (upsert), managed `domain_dns_records`, append-only `domain_dns_changes`,
  `markSync`, and `hostingAccountOrg` (tenant-scoped crossover lookup).
- `dns/DomainDnsService.ts` (new) — provider-neutral orchestration enforcing all
  §8 rules (below).
- `RegistrarProvider.ts` — DNS types + interface methods `setNameservers`,
  `getDnsRecords`, `applyDnsRecords`, `getDnssec` (mutations carry the five-way
  outcome).
- `FakeRegistrarProvider.ts` — full in-memory DNS (zone + nameservers + DNSSEC +
  scriptable ambiguous/timeout).
- `NameSiloRegistrarProvider.ts`, `NamecheapRegistrarProvider.ts` — DNS methods
  **fail closed** (live HTTP wiring deferred; see §7).
- `registrarFactory.ts` — `DisconnectedRegistrarProvider` rejects the new methods.
- `PostgresDatabase.ts` — additive: `domain_dns_state += dnssec_status,
  last_provider_sync_at, sync_state`; new `domain_dns_records`,
  `domain_dns_changes`.

### Safety rules enforced (docs/26 §8 + Stage 8 authorization §5)
- **Only after confirmed registration** — every mutation gates on a confirmed,
  tenant-owned `domain_registrations` row (`status='active'`); DNS state is a
  SEPARATE table/columns from ownership.
- **Preview before apply** — `previewRecordChanges` diffs adds/updates/deletes +
  protected conflicts + validation issues with **no provider call and no audit**.
- **Preserve, don't clobber** — existing records are kept; a change that deletes
  or overwrites a **protected** record is refused unless `authorizeProtected` is
  set (destructive-change confirmation gate).
- **Records vs nameservers** are distinct operations/states.
- **Honest outcomes** — an `ambiguous_unknown` (or a thrown/timeout) does **not**
  mutate the local desired set, sets provisioning `unknown`, flags
  `reconcileRequired`, makes **no auto-rollback** promise, and drives read-only
  reconciliation.
- **Honest propagation** — every result carries a "not instant … minutes to 48h"
  note.
- **PII-minimised audit** — `domain_dns_changes` stores change type + record type
  + host label + a value **fingerprint** (sha256 prefix), never the value body.
  Proven at the schema level (no `value` column).
- **Crossover defense** — hosting attach requires the account to belong to the
  **same tenant** (Postgres org-scoped; in-memory mirrors it).
- **DNSSEC status** read-only; DS/key material never surfaced.

### Permissions
DNS/hosting/contact actions are owner-scoped per docs/26 §10 policy; the service
records an `actorUserId` on every change. UI/API enforcement lands in Stage 11.

---

## §Provider capability limitations

- **NameSilo (launch):** DNS is documented + applicable —
  `changeNameServers`, `dnsListRecords/dnsAddRecord/dnsUpdateRecord/
  dnsDeleteRecord`, `dnsSec*` (capability matrix, evidence = _docs_). **Not yet
  verified in OTE** (no sandbox credentials); live DNS HTTP is deferred.
- **Namecheap (secondary):** DNS is replace-all (`domains.dns.setHosts/getHosts/
  setCustom`); wiring deferred.
- **Domain Defender:** never requested/stored/transmitted/automated; unchanged.
- **Pricing:** unchanged and out of Stage 7/8 scope — provider pricing stays
  dynamic/authoritative at quote/recheck time; retail assumed; Discount Program
  not enrolled and not hard-coded.

---

## §Disposable real-PostgreSQL evidence (§2 hard requirement)

Both new repositories were exercised against a **disposable schema on the live
PostgreSQL server** (search_path pinned; the compiled repo code, not raw SQL),
then the schema was dropped. **The production `public` schema was verified
unchanged at 74 tables in both runs.**

- **Saga repository (Stage 7): 24/24 GREEN** — createOrder (computed
  `markup_minor`, `pricing_version`), get/getByCheckoutId/update mapping, lease
  claim + **concurrent `FOR UPDATE SKIP LOCKED`** (claimed exactly once),
  crash-lease recovery → `registration_unknown`, `claimUnknownForReconcile`,
  refund idempotency (`ON CONFLICT (order_id)`), duplicate `idempotency_key` →
  `23505`, FK `SET NULL` (quote) + `RESTRICT` (org, order) → `23503`, idempotent
  double-`initialize()`, tenant isolation, public unchanged.
- **DNS repository (Stage 8): 17/17 GREEN** — `putState` upsert
  (`ON CONFLICT (registration_id)`, one row), `markSync`, `replaceRecords`
  clean-replace + `domain_dns_records_uniq` → `23505`, append-only change log
  ordering, **schema proof that `domain_dns_changes` has a `value_fingerprint`
  column and no `value` column**, `hostingAccountOrg` tenant crossover
  (same-tenant visible, other-tenant hidden), tenant isolation (state/records/
  changes), registration delete **CASCADE** (state+records+changes = 0), org FK
  **RESTRICT** → `23503`, idempotent double-`initialize()`, public unchanged.

---

## §Tests / CI

- Full domain suite: **194 passed | 3 skipped** (17 files); Stage 7 worker +
  multi-tenant tests and Stage 8 DNS tests (14) included.
- Full local suite: **1651 passed | 9 skipped | 0 failed** (606 suites, exit 0).
- Typecheck: clean.
- Linux CI: **GREEN** — "Validate Faith Harbor OS" run `32293616267` at
  `9ad066b` completed with conclusion _success_ (the full suite is typechecked +
  run on Linux, per the validate-before-push discipline).

---

## §Deferred integration points (Stage 11+)

1. Mount the HTTP Stripe webhook route with raw-body signature verification.
2. Schedule `DomainSagaWorker.runOnce()` on a tick in the platform server.
3. Owner/admin UI + API for reconciliation, DNS management, and hosting attach.
4. Live NameSilo (then Namecheap) DNS HTTP, proven first in OTE sandbox.
5. Wire white-label `OrganizationDomainService.add()/verify()/resolve()` so a
   registered domain becomes a routable domain.
6. Renewal (Stage 9) and transfers (Stage 10) remain out of scope.

---

## §Residual risks

- **No live provider DNS proof yet** — the DNS service is proven only against the
  fake provider + real PG persistence; NameSilo OTE behavior (esp. ambiguous
  outcomes, Domain Defender gating on nameserver changes) is unverified until
  sandbox credentials exist.
- **Worker scheduling unproven in-process** — crash recovery is proven at the
  repository level (expired-lease → unknown) and in unit tests, but not yet under
  a real killed process (Stage 11).
- **Propagation/DNSSEC are provider-reported** — surfaced honestly (sync_state +
  last_provider_sync_at), never asserted as ground truth.

---

## §Stage-8 DNS boundary reconciliation (correction commit)

The initial Stage 8 did **not** model DNS *authority*: `applyRecordChanges`
called the registrar's `applyDnsRecords` regardless of whether the domain was
actually using that registrar's authoritative DNS. This was **corrected** in a
separate commit; the boundaries are now enforced and proven:

- **Three capabilities are separate** — registrar **nameserver delegation**
  (`setNameservers`), registry **DS/glue** (DNSSEC is READ-ONLY via `getDnssec`;
  no DS/glue mutation is offered), and authoritative **zone-record** management
  (`applyDnsRecords`). Documented in `dns/dnsAuthority.ts` header.
- **Records only when we own the zone, freshly** — `DomainDnsService.
  applyRecordChanges` calls `verifyAuthority()` first, which READS the live
  nameservers (`registrar.getNameservers`) and classifies them
  (`classifyAuthority`) against an INJECTED provider→NS-suffix map (never
  hard-coded). Mutation proceeds only when the authority equals the registrar's
  authoritative provider (`namesilo`) with `recordManagement: "supported"`;
  otherwise it throws `DnsAuthorityError`. Persisted to `domain_dns_state`
  (`authority_provider`, `authority_state`, `authority_verified_at`).
- **cPanel / All Elite Hosting = externally managed** — a domain on
  `allelitehosting.com` nameservers classifies as `cpanel` /
  `externally_managed`; record mutation is refused until a dedicated cPanel DNS
  adapter is built and tested. `recordCapability()` surfaces this honestly.
- **Never auto-switch nameservers** — the only path that changes nameservers is
  the explicit `setNameserverMode`; register / hosting-attach / record-edit call
  it never. Proven by the hosting-attach test asserting nameservers are
  unchanged.
- **Hosting attach touches neither nameservers nor records** — `attachHosting`
  only sets `hosting_account_id`; a test asserts NS and the record set are
  byte-for-byte unchanged across an attach.
- **Deterministic tests** (`dns/domainDns.test.ts`, "DNS authority boundary"):
  NameSilo-authoritative→allowed; cPanel-authoritative→refused; unknown (no NS)
  →refused; provider timeout→refused (authority `unknown`, never assumed ours);
  cross-provider (foreign NS)→refused; hosting-attach→NS+records unchanged.
- **Schema** (additive, idempotent): `domain_dns_state += authority_provider,
  authority_state, authority_verified_at`. Re-proven on disposable PostgreSQL
  (**18/18**, incl. authority persistence + upsert), public unchanged at 74.

Full domain suite after the correction: **200 passed** (DNS file 20 tests).

## §GO / NO-GO

**GO to keep Stages 7 & 8 committed on-branch as sandbox/test-only cores.**
**NO-GO for any enablement/deployment** — unchanged. Recommended next gate:
Stage 9/10 design or Stage 11 integration, on explicit approval, with NameSilo
OTE credentials to convert the docs-evidence DNS capabilities into sandbox-
verified ones before any live path is contemplated.

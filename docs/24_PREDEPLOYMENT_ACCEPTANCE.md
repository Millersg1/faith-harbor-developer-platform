# Consolidated pre-deployment acceptance report — `feature/public-lead-forms`

**Status: NOT deployed. No deployment, merge, PR, DNS, SMTP, or infrastructure
change has been made.** This report is the acceptance checkpoint; production
cutover requires explicit approval.

- **Latest commit:** `469bbb1` (feature/public-lead-forms).
- **Linux CI:** green on the exact commit (Ubuntu 24.04, Node v24.18.0):
  typecheck + `vitest run` (1425 passed / 4 skipped) + build. The 4 skipped are
  the two opt-in real-browser fixtures (no browser binary on CI). A single
  `validate` workflow ran — no deploy/release/publish workflow exists or ran.
- **Local:** `npm run validate` green apart from one Windows-forks-only
  `ECONNRESET` flake in `createPlatformApp.test.ts "serves the web UI pages as
  HTML"` (large `/app` page under load; passes on Linux CI; unrelated to this
  work — documented in `vitest.config`).

## What shipped (by stage)

- **S5** consent capture + separation; **S6** suppression, no-login unsubscribe,
  double opt-in, pre-send eligibility; **S7a** durable marketing outbox with
  honest delivery semantics; **S7b-i/ii** provider-independent
  `EmailDeliveryProvider` + SMTP adapter.
- **S7b-iii(b:2–3)** account-email verification (opaque tokens, atomic
  verify-vs-email-change, bounded sibling links), owner/admin marketing-sender
  **test email**, and public-submission wiring with a **transactional
  double-opt-in confirmation dispatch**. Account-verification email uses the
  **configured, authenticated transactional sender** (fails closed; never an
  invented address).
- **S7b-iv** operational safeguards: durable restart-safe per-tenant/platform
  hourly/daily + concurrency limits, attempts-vs-sends separation, per-tenant
  fairness, final send-time eligibility, observable-only failure-rate auto-pause,
  `delivery_unknown` review, owner/admin pause/resume/cancel, PII-free health.
- **S7b-v** single mutually-exclusive `MARKETING_DELIVERY_MODE`
  (disabled|legacy|outbox), **fail-closed when unset**; legacy drip and the
  safeguarded outbox can never both send; idempotent, dry-run reconciliation for
  existing enrollments; documented cutover + rollback (`docs/22`).
- **S8** lead-magnet fulfillment (transactional, marketing-independent): redirect
  (https-only), email (secure download-link), and controlled time-limited
  download; owner/admin config + inspection.

## Acceptance gates

### The autoresponder is NOT "operational" until (S7b-v gate)
- [x] Marketing can be routed through the outbox EXCLUSIVELY (`outbox` mode).
- [x] The outbox worker can be safely enabled (durable, restart-safe, fair,
      rate-limited, auto-pause).
- [x] The legacy path CANNOT send concurrently (single mode; proven by tests).
- [x] Migration + cutover + rollback procedures documented and the migration is
      test-proven.
- [ ] **Production cutover EXECUTED — intentionally NOT done.** Requires the
      operator to set `MARKETING_DELIVERY_MODE` deliberately + run the migration
      (see `docs/22`). Currently unset → `disabled` (fail-closed): no marketing
      sends until an operator opts in.

### Deliverability (read-only verification still required — `docs/21`)
- [ ] SPF/DKIM/DMARC alignment, PTR/HELO, verified TLS confirmed for each sending
      domain. **Owning the web domain is not sending authentication.**
- [ ] App marketing caps compared to, and set ≤, the real Exim/cPanel (or
      provider) limits. Current caps are conservative CONFIGURABLE placeholders,
      not a measured capacity claim.

## Honest limitations (stated, not worked around)

- **SMTP acceptance ≠ inbox delivery.** `accepted` means the server took
  responsibility; ambiguous/crashed attempts are `delivery_unknown` and are never
  auto-resent (manual review only).
- **No malware scanning.** Lead magnets are **PDF-only** (declared MIME + `.pdf`
  name + `%PDF-` signature + size + tenant-owned + non-deleted). Signature +
  extension checks are NOT malware scanning and cannot guarantee a PDF is
  harmless; SVG/ZIP/HTML/executables/scripts/other types are blocked until a real
  scanning pipeline exists.
- **Download has no resume.** The capability + one-time session are single-use;
  an interrupted download or a process restart spends them (a fresh capability is
  needed via email retry / new submission).
- **In-memory rate limiters** are per-process (documented); durable limits use
  the DB and survive restarts.

## Security posture (highlights)

- Opaque random capabilities everywhere (verification, double-opt-in, magnet
  download): SHA-256 hash-only at rest, bindings only in the server record, never
  in a URL/log/audit/referrer. Fragment-exchange strips tokens from history.
- The magnet download-session cookie is a hardened one-time capability:
  Secure + HttpOnly + SameSite=Strict + host-only (no Domain) + short TTL +
  single-use + rotated + atomically consumed.
- Tenant isolation throughout; client-supplied org/file/redirect/mode/host values
  are ignored (owner config only). Enumeration-safe public responses.
- Marketing unsubscribe (List-Unsubscribe/one-click) appears ONLY on actual
  marketing messages — never on verification/test/confirmation/magnet email.
- No recipient PII, raw tokens, SMTP bodies, or credentials in audit/health/logs.

## Deferred / follow-up (require separate authorization)

1. **Production marketing cutover** — operator sets `MARKETING_DELIVERY_MODE`,
   runs the reconciliation, enables one worker, sends approved test messages,
   observes (see `docs/22`). Not executed here.
2. **Deliverability DNS verification** — read-only, at acceptance (see `docs/21`).
   No DNS changed.
3. **Phase 5 reconciliation** — `feature/privacy-request-workflow` (Phase 5) is a
   sibling branch, NOT accepted/merged. Reconciliation is DEFERRED until Phase 5
   is accepted. Read-only overlap assessment: the privacy feature is self-
   contained new files; the only shared, ADDITIVE files are
   `src/persistence/PostgresDatabase.ts`, `src/platform/createPlatformApp.ts`,
   `src/platform/platformServer.ts`, and `src/platform/web/pages.ts` (appended
   migrations, added app deps/routes, added server wiring). Merge onto the
   accepted Phase 5 line, resolving those four carefully, verifying linear
   history first.
4. **Real malware scanning** — precondition for broadening magnet file types.
5. **Multi-instance rate limiting** — swap in-memory limiters for a shared store
   if the deployment becomes multi-process.

## Test coverage (deterministic)

Verification, test-email, confirmation dispatch, submission wiring, marketing
limits/pause/worker/activation, delivery-mode gating + reconciliation, and the
full lead-magnet suite (capability lifecycle + siblings, PDF policy, fulfillment,
transactional dispatch with honest states + no blind resend, hardened download
session + route, owner/admin ops) — plus two opt-in real-browser (Playwright)
fixtures for the verify-email and magnet-download fragment exchanges.

**Recommendation:** the branch is CI-green and ready for review. Do not deploy or
merge without explicit approval; when approved, follow `docs/22` (cutover) and
`docs/21` (deliverability), and reconcile with Phase 5 only after its acceptance.

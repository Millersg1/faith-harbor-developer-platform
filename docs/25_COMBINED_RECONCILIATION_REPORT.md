# Combined report — deliverability verification + Phase 5 reconciliation

**Nothing deployed. Marketing remains DISABLED. No DNS/Exim/cPanel/PR/cutover
change was made.** Read-only checks + a local branch merge only.

- **Branch:** `feature/public-lead-forms`
- **Final commit:** `36966ef` — **Linux CI green** (Ubuntu 24.04, Node v24.18.0;
  typecheck + 1462 passed / 6 skipped + build; single `validate` workflow, no
  deploy). Rollback tag `pre-phase5-merge` = `b59ac03`.

---

## Part 1 — Deliverability verification (read-only)

Verified via DNS lookups + a read-only SSH probe of the live cPanel host
(`server.allelitehosting.com`). **No email was sent.** Outbound mail IP =
`mainip 192.227.127.13`; app transport = `SMTP_HOST=os.faithharborwebhosting.com`,
port `465` (implicit TLS).

| Check | Target | Result | Evidence / note |
|---|---|---|---|
| SPF present + authorizes sender | faithharborwebhosting.com, allelitecloud.com | **PASS** | single TXT each, `v=spf1 +a +mx +ip4:192.227.127.13 …`; authorizes the .13 send IP |
| SPF hardfail | both | **WARN** | `~all` (softfail); move to `-all` once senders are stable |
| DKIM key published | `default._domainkey.<both>` | **PASS** | `v=DKIM1; k=rsa; p=…` present (cPanel `default` selector) |
| DKIM live signing on send | — | **WARN/UNVERIFIED** | not proven without sending a message (deliberately not sent) |
| DMARC present | `_dmarc.<both>` | **PASS** | record exists |
| DMARC enforcement + reporting | both | **WARN** | `p=none` (observe-only), no `rua` aggregate mailbox |
| PTR / reverse DNS (send IP) | 192.227.127.13 | **PASS** | `192.227.127.13.hosted.at.cloudsouth.com` |
| Forward-confirmed rDNS (send IP) | .13 | **PASS** | PTR host forward-resolves to .13 |
| FCrDNS (other IP) | .69 (`mail.allelitehosting.com`) | **WARN** | PTR→`mail.allelitehosting.com` resolves to .66, not .69 — but .69 is NOT the send IP (informational) |
| SMTP HELO/EHLO identity | greeting | **PASS** | `server.allelitehosting.com` (forward-resolves to send IP .13) |
| HELO/PTR exact match | .13 | **WARN** | HELO `server.allelitehosting.com` ≠ PTR `…hosted.at.cloudsouth.com`; both forward-confirm to .13 (accepted by most receivers, not strict-match) |
| TLS availability + cert valid | :587/:25 STARTTLS | **PASS** | TLSv1.3, Let's Encrypt cert, `Verify return code: 0 (ok)` |
| TLS legacy disabled (1.0/1.1) | :587 | **WARN/INCONCLUSIVE** | 1.2/1.3 confirmed; probe couldn't prove 1.0/1.1 are rejected (needs WHM Exim SSL config) |
| SMTP AUTH + TLS fail closed | app path | **PASS** | port 465 = implicit TLS (mandatory); provider treats TLS failure as pre-acceptance, never downgrades |
| Exim per-account hourly/daily cap | account | **WARN** | `MAX_EMAIL_PER_HOUR=unlimited` — the SERVER imposes no cap; the app is the only throttle |
| WHM global "max hourly per domain" | server | **BLOCKED** | not readable as a non-root cPanel user |
| Queue/concurrency | Exim | **PASS (info)** | `smtp_accept_max=100`, `queue_run_max=5`, `deliver_queue_load_max=240`, `smtp_accept_queue_per_connection=30`, session `MAILMAX=1000 RCPTMAX=50000` |
| App caps ≤ server limits | app vs server | **WARN** | server = unlimited, so app defaults are trivially below it, but "unlimited" is unsafe — use conservative caps (below) |
| Transactional priority over marketing | app | **PASS (app-level)** | separate transactional worker, always runs; marketing gated. No Exim-level priority (single queue) |
| Public blocklists | .13, .69 | **PASS** | not listed on zen.spamhaus.org / bl.spamcop.net / b.barracudacentral.org |

**No inbox-placement claim is made from these checks.**

### Recommended conservative INITIAL app caps (do NOT apply yet; warm up gradually)
Because the server cap is "unlimited" and DMARC is `p=none` with no warmup
history, start low and raise with observed reputation:
- per-tenant: **50/hour, 200/day**; platform: **200/hour, 1000/day**
- concurrency: per-tenant **2**, platform **5**
(Current code defaults are 100/500/500/2000/2/6 — lower to the above for launch.)

---

## Part 2 — Phase 5 reconciliation

**Method:** `git merge --no-ff feature/privacy-request-workflow` into
`feature/public-lead-forms`. Only ONE file conflicted; the other three shared
files auto-merged and were reviewed. No whole-file side was chosen.

### File-by-file shared-file resolution
- **`createPlatformApp.ts`** — the only content conflict (both branches inserted a
  router mount at the same point). Resolved by mounting **all three**:
  `createMarketingOpsRouter` + `createMagnetOpsRouter` (this branch) **and**
  `createPrivacyManagementRouter` (Phase 5). Also removed a **doubled**
  `RateLimiter/rateLimit` import (both branches added it). Privacy public intake +
  fragment-exchange routes, `deps.privacy`, and all magnet/marketing deps retained.
- **`platformServer.ts`** — auto-merged; verified the `PrivacyRequestService` is
  constructed and passed to the app alongside the magnet/marketing services and
  the separate transactional worker.
- **`PostgresDatabase.ts`** — auto-merged; both migration sets present, **no
  duplicate table/index**.
- **`web/pages.ts`** — auto-merged; both branches' page content present.

### Combined migration / schema proof
- **No duplicate** `CREATE TABLE`/`CREATE INDEX` (verified).
- **Idempotent by construction:** 74/74 `CREATE TABLE`, 53/53 `CREATE INDEX`,
  28/28 `ALTER TABLE ADD COLUMN` use `IF NOT EXISTS`.
- **Real disposable-PostgreSQL init test: BLOCKED** — no Postgres/docker/psql in
  this environment, and the currently-deployed app uses SQLite (production has no
  PG to test against safely). Recommend running the real-PG init/idempotency test
  in an environment with Postgres before the platform's first PG deploy.

### Invariants preserved (verified by tests)
Privacy-request verification and account-email verification never count as
marketing consent; lead-magnet requests are independent of marketing enrollment;
a tenant marketing unsubscribe does not block a requested transactional magnet;
global (legal/abuse/invalid/safety) suppression still blocks applicable email;
Phase 5 trusted-host + autoresponder host-boundary protections both intact;
`MARKETING_DELIVERY_MODE` unset/malformed → `disabled`; transactional workers
independent of marketing mode; immutable V1 legal docs untouched; no fabricated
legal/verification timestamps.

### Test totals + browser evidence
- **Full merged suite (Linux CI @ 36966ef): 1462 passed / 6 skipped**, build ✓.
- Local: same, plus the one Windows-forks `ECONNRESET` flake (green on Linux).
- **Real-browser (Playwright, opt-in, 6 passed):** verify-email exchange;
  lead-magnet download (fragment strip, PDF attachment, mobile + reduced-motion,
  forged→generic-fail); privacy intake (desktop + phone, no JS errors, no
  horizontal overflow) + privacy verify fragment exchange (token stripped, never
  in a URL, no third-party).
- Deterministic coverage for the remaining browser-listed behaviors: external
  lead form from an allowed Origin + denied Origin (forms CORS tests), no-login
  unsubscribe + double opt-in (marketing route tests), owner/admin vs member
  (requireRole tests), cross-tenant fail-closed + forged Host/X-Forwarded-Host
  (host-boundary + ops-router tests).
- **Audit/log PII posture:** health, worker health, magnet/marketing ops
  projections, and dispatch records carry no recipient address, raw token, SMTP
  body, or credential (asserted by tests).

---

## Exact environment changes required before deploying the platform (marketing off)

1. **`SMTP_FROM` is UNSET** → set an authenticated From on a DKIM-signing domain
   (e.g. `no-reply@allelitecloud.com`). Until set, transactional email
   (verification + magnet) **fails closed** (nothing sends).
2. **`PLATFORM_SECURE_COOKIE` is UNSET** → set truthy so the download-session
   cookie gets `Secure` and HSTS is sent.
3. **`PLATFORM_BASE_DOMAIN` is UNSET** → set (canonical confirmation/unsubscribe/
   download URLs; defaults to `allelitecloud.com` otherwise).
4. **`MARKETING_DELIVERY_MODE`** — leave UNSET (→ `disabled`) for this deploy.
5. **PostgreSQL** — the platform requires Postgres; provision it and set the PG
   connection env. (The currently-live `dist/server.js` is the single-tenant
   SQLite app — deploying the multitenant PLATFORM is a distinct rollout.)
6. **DNS (deferred, needs authorization):** DMARC `p=none`→`quarantine`/`reject`
   + add `rua`; SPF `~all`→`-all`; confirm TLS 1.0/1.1 disabled.

## Proposed production deployment plan (marketing DISABLED)
1. Back up the database + app directory.
2. Provision Postgres; set the PG connection env.
3. Set `SMTP_FROM`, `PLATFORM_BASE_DOMAIN`, `PLATFORM_SECURE_COOKIE=1`; leave
   `MARKETING_DELIVERY_MODE` unset (→ disabled).
4. Build (`npm run build` + frontend) and deploy the platform entrypoint.
5. Start exactly one process; check `/system-health`: db ok,
   `marketingDeliveryMode: "disabled"`, `transactionalWorker.running: true`.
6. Smoke-test transactional flows (account verification, privacy intake, a
   lead-magnet) to **explicitly approved test recipients only**.
7. Observe. Marketing stays off; no bulk email.

## Proposed marketing cutover plan (SEPARATE, later — requires approval)
Per `docs/22`: resolve deliverability WARNs (tighten DMARC, set conservative
caps) → pause legacy → dry-run reconciliation → review needs-attention →
idempotent migration → set `MARKETING_DELIVERY_MODE=outbox` → start one worker →
verify limits/priority/sender/suppression/metering → approved test sends →
observe before normal volume.

## Rollback procedure
1. **Set `MARKETING_DELIVERY_MODE=disabled` FIRST** (stops all marketing; keeps
   transactional).
2. Preserve all additive tables (never drop them); an app-code rollback keeps the
   data intact for a forward-fix.
3. Never auto-restart legacy sending; reconcile sent/unknown before choosing a
   mode; `delivery_unknown` stays manual-review only; forward-fix preferred once
   outbox delivery has begun.
4. To fully revert this reconciliation: `git reset --hard pre-phase5-merge`
   (tag `b59ac03`) — before any push-based deployment of the merged line.

## Remaining risks & honest limitations
- **No malware scanning** → magnets are **PDF-only** (signature/extension checks
  are not malware scanning).
- **SMTP acceptance ≠ inbox delivery**; ambiguous sends are `delivery_unknown`,
  never auto-resent.
- **DMARC `p=none`** — no enforcement yet; **server email cap is unlimited** — the
  app is the sole throttle until caps are lowered + a WHM cap is considered.
- **TLS 1.0/1.1-disabled unverified** (needs WHM); **real-PG init test BLOCKED**
  locally (idempotent by construction only).
- **The platform is not the currently-deployed app** (SQLite single-tenant is
  live) — deploying it is a new rollout requiring the env + Postgres above.

**Awaiting explicit approval before any deployment or marketing cutover.**

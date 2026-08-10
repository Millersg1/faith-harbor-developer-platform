# Combined report — deliverability + Phase 5 reconciliation (production-target corrected)

**Nothing deployed. Marketing remains DISABLED. No DNS/Exim/cPanel/.env/PR/
cutover change was made.** This revision replaces an earlier version whose
"environment" section was gathered against the **wrong application** (the
single-tenant Faith Harbor OS in `~/os`, SQLite, port 3200). Every environment,
database, and SMTP statement below is re-verified **read-only against the actual
All Elite Cloud production target**.

- **Branch:** `feature/public-lead-forms`
- **Code commit under review:** `36966ef` (Linux CI green: typecheck + 1462
  passed / 6 skipped + build). This correction is a **docs-only** commit on top
  of `aceddc1`; it changes no application code. Rollback tag
  `pre-phase5-merge` = `b59ac03`.
- **Correction verified:** 2026-08-09, read-only, via the authorized
  `faithhosting@server.allelitehosting.com` account (non-root).

---

## Production target (verified this pass — read-only)

| Fact | Verified value |
|---|---|
| Application | **All Elite Cloud** (multi-tenant platform), public `https://allelitecloud.com` |
| App dir / account | `~/aecloud` on the `faithhosting` account |
| Entrypoint | `dist/platform/platformServer.js` — **present** |
| Process | **single** PID 3652043 (`~/nodejs24/bin/node dist/platform/platformServer.js`) |
| Listener | **127.0.0.1:3300** (loopback only); `/health` → **200** |
| Database | **PostgreSQL 13.23**, DB `faithhosting_aecloud`, **56 public base tables** (pre-release) — this IS the live backing store |
| Separate app | Faith Harbor OS = **different** process PID 592500 (`dist/server.js`), port 3200, SQLite. No shared process/DB/.env with `~/aecloud`. |

**Correction of record:** the platform is **already the deployed, PostgreSQL-
backed production app** (Phase 4 line, consistent with the 56-table schema and the
present `tenant_legal_documents` / `tenant_legal_questionnaire` / `privacy_requests`
tables). The earlier claim "SQLite single-tenant is live / the platform is not
deployed / Postgres must be provisioned" was an artifact of inspecting `~/os`
and is **withdrawn**.

---

## Corrected environment reconciliation (names/presence only — no secret values printed)

### Already present and verified in `~/aecloud/.env`
Everything the platform needs to run transactionally is **already configured**:

| Variable | Status | Non-secret detail |
|---|---|---|
| `PG_HOST` `PG_PORT` `PG_USER` `PG_PASSWORD` `PG_DATABASE` | **PRESENT** | Postgres selected; DB live with 56 tables (`DATABASE_URL` absent — discrete vars used) |
| `SMTP_HOST` | **PRESENT** | `mail.allelitecloud.com` |
| `SMTP_PORT` | **PRESENT** | `465` (implicit TLS) |
| `SMTP_USER` | **PRESENT** | an `@allelitecloud.com` mailbox (AEC-controlled) |
| `SMTP_PASSWORD` | **PRESENT** | (value not read) |
| `SMTP_FROM` | **PRESENT** | **`hello@allelitecloud.com`** — AEC-controlled, DKIM-signable; matches Phase A's acceptance sender |
| `PLATFORM_PORT` | **PRESENT** | `3300` |
| `PLATFORM_BASE_DOMAIN` | **PRESENT** | `allelitecloud.com` |
| `PLATFORM_SECURE_COOKIE` | **PRESENT** | `true` |
| `PLATFORM_ADMIN_EMAIL` | **PRESENT** | bootstrap admin |

> The earlier report's "must set `SMTP_FROM` / `PLATFORM_BASE_DOMAIN` /
> `PLATFORM_SECURE_COOKIE`; must provision Postgres" items are all **false for
> this target** and are withdrawn. Those conclusions came from the `~/os` env.

### Genuinely required only for the combined deployment
**None that require an env change.** The new subsystems introduce only *optional*
variables, all with safe defaults:

| Variable | Deploy value | Effect if unset |
|---|---|---|
| `MARKETING_DELIVERY_MODE` | **leave UNSET** | resolves to **`disabled`** (fail-closed) — verified in `resolveMarketingDeliveryMode`; unset/empty/malformed → `disabled` |
| `MARKETING_TICK_MS` | leave unset | default worker cadence |
| `DRIP_TICK_MS` | leave unset | default legacy-drip cadence |
| `RETENTION_TICK_MS` / `RETENTION_FILE_DAYS` | leave unset | default retention cadence/threshold |
| `PLATFORM_BIND_HOST` | leave unset | already binds loopback `127.0.0.1` |

**Worker safety (verified in `platformServer.ts`):** the
`TransactionalDispatchWorker` timer runs **unconditionally** (confirmation +
lead-magnet dispatch), using the configured transactional sender
(`SMTP_FROM=hello@allelitecloud.com`) and failing closed only if that were
absent (it is not). The `MarketingWorker` sends **only** when
`MARKETING_DELIVERY_MODE === "outbox"`, and `activateReady` runs only in
`outbox`. With the variable unset → **marketing sends nothing while transactional
email works**. No worker that originates *new* outbound marketing activity is
enabled by this deploy.

---

## Part 1 — Deliverability verification (read-only; corrected domain + endpoint)

The **From domain is `allelitecloud.com`** and the submission endpoint is
`mail.allelitecloud.com:465` (from `~/aecloud/.env`). The earlier run checked
`faithharborwebhosting.com` / `os.faithharborwebhosting.com` — the wrong app's
transport — and is superseded. **No email was sent.**

| Check | Result | Evidence / note |
|---|---|---|
| SPF present + authorizes sender | **PASS** | `allelitecloud.com` TXT = `v=spf1 +a +mx +ip4:192.227.127.13 +ip4:192.227.127.69 ~all` — authorizes **both** candidate outbound IPs, so SPF passes regardless of which Exim uses |
| SPF hardfail | **WARN** | `~all` softfail; move to `-all` after warm-up (deferred, needs authorization) |
| DKIM key published | **PASS** | `default._domainkey.allelitecloud.com` = `v=DKIM1; k=rsa; p=…` (cPanel `default` selector) |
| DKIM live signing on send | **UNVERIFIED** | not proven without sending (deliberately not sent) |
| DMARC present | **PASS** | `_dmarc.allelitecloud.com` = `v=DMARC1; p=none;` |
| DMARC enforcement + reporting | **WARN** | `p=none` (observe-only), no `rua` (deferred) |
| SMTP endpoint TLS + cert | **PASS** | `mail.allelitecloud.com:465` → valid **Let's Encrypt** cert, **CN=allelitecloud.com**, valid **through 2026-10-20** |
| Implicit-TLS fail-closed | **PASS** | port 465 = mandatory TLS; a TLS failure is pre-acceptance, never a plaintext downgrade |
| Endpoint IP / PTR | **INFO** | `mail.allelitecloud.com` → `192.227.127.69`; PTR → `mail.allelitehosting.com` (shared cPanel mail host) |
| Authenticated sender authorized for From | **PASS (config-level)** | `SMTP_USER` is an `@allelitecloud.com` mailbox on the account that owns `allelitecloud.com`; sending as `hello@allelitecloud.com` is within that account's own domain |
| Exim queue/concurrency | **INFO** | `smtp_accept_max=100`, `queue_run_max=5`, `deliver_queue_load_max=240`, `smtp_accept_queue_per_connection=30` |
| Exim/WHM per-account hourly cap | **BLOCKED** | the *sending* account is `allelitecloud`; `/var/cpanel/users/allelitecloud` is **root-only** (no sudo on the authorized account). Global `maxemailsperhour` in `cpanel.config` reads as **unset/unlimited**. |
| Public blocklists (.13, .69) | **PARTIAL PASS** | **SpamCop + Barracuda: not listed** (both IPs). **Spamhaus: inconclusive** — query returned `127.255.255.254` (public-resolver block, not a listing); re-run from an authorized resolver to confirm |

**No inbox-placement claim is made from these checks.** SMTP acceptance ≠ inbox
delivery.

### Mail-cap posture
Because the `allelitecloud` account's hourly cap is root-only (unread) and the
global cap reads as unlimited, **the application's own caps are the primary
throttle**. The app's *marketing* caps only take effect at the separate marketing
cutover (marketing is off here). Recommended before that cutover: owner confirms
the `allelitecloud` account `MAX_EMAIL_PER_HOUR` in WHM and, ideally, sets a
server-side cap **above** the app's platform cap as defense-in-depth.

---

## Part 2 — Phase 5 reconciliation + real disposable-PostgreSQL init test

### Merge resolution (unchanged from the accepted reconciliation)
`git merge --no-ff feature/privacy-request-workflow` into
`feature/public-lead-forms`. One content conflict (`createPlatformApp.ts` — both
branches inserted a router mount; resolved by mounting **all three**:
marketing-ops + magnet-ops + privacy-management, and removing a doubled
`RateLimiter/rateLimit` import). `platformServer.ts`, `PostgresDatabase.ts`,
`web/pages.ts` auto-merged and were reviewed; no duplicate table/index.

### Real disposable-PostgreSQL init test — **DONE** (was previously BLOCKED)
Run **on the server** against the live Postgres 13.23, inside a **disposable
schema** with `search_path` pinned to it (so `public` is never touched), using the
**exact `aceddc1`-built `PostgresDatabase.initialize()`**. A fresh production
`pg_dump` backup was taken first (`~/aecloud/backups/aecloud-db-20260809-222647.sql.gz`,
gzip-verified) and **not restored**; no production migration was run.

**Fresh-install result (empty schema → init):**
- `init` succeeded; **74 base tables**, **53 explicit indexes** (of 136 total,
  incl. 83 PK/UNIQUE-backed), **707 columns**.
- **76 foreign keys, 74 `ON DELETE CASCADE`**; **0** `organization_id` FKs are
  non-cascade → tenant-scoped cascade is structurally correct.
- **Additive vs production:** the release adds exactly **18 new tables** over the
  live 56 (`confirmation_dispatch`, `double_optin_tokens`, `email_suppressions`,
  `email_verification_tokens`, `lead_magnet_capabilities`, `lead_magnet_dispatch`,
  `lead_magnet_download_sessions`, `lead_magnet_fulfillments`,
  `marketing_activations`, `marketing_consents`, `marketing_outbox`,
  `marketing_outbox_attempts`, `marketing_pause`, `marketing_send_meter`,
  `marketing_sender_config`, `platform_audit_events`, `privacy_request_notes`,
  `unsubscribe_tokens`); **0 tables removed**.
- **Idempotent:** a second `init` produced identical counts (74 tables / 707
  columns). Representative repo-query shapes (`marketing_outbox`,
  `privacy_requests`, `lead_magnet_fulfillments`) validated.

**Upgrade simulation (clone of the real 56-table production structure → init):**
- Prod structure cloned into a second disposable schema (**56 tables**); a
  sentinel row was inserted into `organizations`.
- `aceddc1` init took it **56 → 74** (the 18 additive tables), and the
  **sentinel row survived** both the init and a second idempotent init → the
  additive migration preserves existing data.

**Isolation + cleanup:** both disposable schemas dropped (`CASCADE`), **0**
`aec_disp_*` schemas remain, the temp dir was removed, and **production `public`
is UNCHANGED (56 → 56)**. The gzip backup is retained.

### Invariants preserved (verified by the test suite)
Privacy-request and account-email verification never count as marketing consent;
lead-magnet requests are independent of marketing enrollment; a marketing
unsubscribe does not block a requested transactional magnet; global suppression
still blocks applicable email; Phase 5 trusted-host + autoresponder host-boundary
protections intact; `MARKETING_DELIVERY_MODE` unset/malformed → `disabled`;
transactional workers independent of marketing mode; immutable V1 legal docs
untouched; no fabricated legal/verification timestamps.

### Test totals + browser evidence
- **Merged suite (Linux CI @ `36966ef`): 1462 passed / 6 skipped**, build ✓.
- **Real-browser (Playwright, opt-in, 6 passed):** verify-email exchange;
  lead-magnet download (fragment strip, PDF attachment, mobile + reduced-motion,
  forged→generic-fail); privacy intake (desktop + phone, no JS errors, no
  overflow) + privacy verify fragment exchange (token stripped, never in a URL,
  no third-party asset).
- **PII posture:** health, worker health, ops projections, and dispatch records
  carry no recipient address, raw token, SMTP body, or credential (asserted by
  tests).

---

## Corrected deployment plan (marketing DISABLED) — for approval only, NOT executed

Because Postgres and all required env are **already present**, and the migration
is **additive/idempotent (proven above)**, deployment is a code roll — **no env,
DNS, Exim, or cPanel change**:

1. Take a fresh DB backup (same `pg_dump` procedure used above) + snapshot the
   current `dist`.
2. Build `aceddc1` (`npm run build`) and upload `dist` to `~/aecloud`.
3. Restart the **single** process (established `pkill` + `keepalive.sh` pattern).
   On startup the additive migration creates the 18 new tables (idempotent).
4. `MARKETING_DELIVERY_MODE` stays **unset** (→ `disabled`).
5. Verify `/system-health`: db ok, `marketingDeliveryMode: "disabled"`,
   `transactionalWorker.running: true`; confirm still **one** loopback process on
   `127.0.0.1:3300` and Faith Harbor OS (`:3200`) untouched.
6. Smoke-test transactional flows (account verification, privacy intake, a
   lead-magnet) to **explicitly approved test recipients only** — asked and
   approved first.
7. Observe. Marketing stays off; no bulk email.

**Apache/proxy:** unchanged by this release; the Phase 4 hostname-preservation
includes remain in force (not re-modified this pass).

## Marketing cutover (SEPARATE, later — requires its own approval)
Per `docs/22`: confirm the `allelitecloud` account mail cap + lower app caps to
conservative launch values (e.g. per-tenant 50/hr·200/day, platform
200/hr·1000/day, concurrency 2/5), tighten DMARC (`p=none`→enforce) + SPF
(`~all`→`-all`), pause legacy → dry-run reconciliation → review needs-attention →
set `MARKETING_DELIVERY_MODE=outbox` → start one worker → verify
limits/priority/sender/suppression/metering → approved test sends → observe.

## Rollback
1. `MARKETING_DELIVERY_MODE` remains unset throughout this deploy — nothing to
   disable for marketing.
2. The 18 added tables are additive and harmless; **never drop them** — a code
   rollback (restore the previous `dist`, restart) leaves data intact for a
   forward-fix.
3. Full revert of the reconciliation line (pre-push only):
   `git reset --hard pre-phase5-merge` (`b59ac03`).

## Remaining risks & honest limitations
- **DKIM live signing** and **inbox placement** unproven without a send (not sent).
- **Spamhaus** blocklist status **inconclusive** (public-resolver block); SpamCop
  + Barracuda clean.
- **`allelitecloud` account hourly mail cap** unreadable without root — app caps
  are the primary throttle until confirmed.
- **DMARC `p=none`, SPF `~all`** — no enforcement yet (deferred, needs approval).
- **No malware scanning** → lead magnets are **PDF-only**.
- SMTP acceptance ≠ inbox delivery; ambiguous sends are `delivery_unknown`, never
  auto-resent.

---

## Revised GO / NO-GO

**Recommendation: conditional GO for the marketing-OFF (transactional) deploy** —
schema, migration, environment, and transport are all verified healthy against
the correct target, and deployment requires no env/infra change.

**NO-GO for the marketing cutover** (unchanged) — that is a separate, later,
explicitly-approved step.

Conditions to satisfy before executing the marketing-off deploy:
1. Your explicit approval.
2. Approved test-recipient list for step 6 (I will not send anything before asking).
3. (Advisory, not blocking) owner confirms the `allelitecloud` WHM hourly mail
   cap and, optionally, a Spamhaus re-check from an authorized resolver.

**Awaiting your explicit approval before any deployment. No marketing cutover.**

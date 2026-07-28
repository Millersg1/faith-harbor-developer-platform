# Production Cutover Checklist — All Elite Cloud (multitenant)

> **Part of the All Elite Cloud Operations Manual.**
> Gating rule: **do not modify DNS, `.htaccess`, Apache routing, or the public
> root domain until the owner explicitly approves the cutover.** Until then the
> multitenant platform stays **staging-only**.

## Current state (as deployed)

| Item | Value |
|---|---|
| Multitenant app (this branch) | `~/aecloud`, entrypoint `dist/platform/platformServer.js`, **port 3300** |
| Watchdog | `~/aecloud/keepalive.sh` (cron `* * * * *` + `@reboot`) |
| Backups | `~/aecloud/backups/` (nightly `backup.sh` 03:30; pre-deploy tarballs) |
| Deployed commit | `3ec024e` — remote CI `validate` = **success** (Linux) |
| Single-tenant production | `~/os`, `dist/server.js`, **port 3200**, `os.faithharborwebhosting.com` — **out of scope, do not touch** |
| Public root domain | `allelitecloud.com` currently serves a static docroot ("Index of /"); **no proxy to :3300 yet** |

The app is served **only on `127.0.0.1:3300`** today. Nothing public routes to
it. Acceptance testing is done against `:3300` (via SSH tunnel or a temporary
staging host), never by editing the public domain.

---

## Phase A — Acceptance testing (run on staging `:3300`, no infra changes)

Each item: verify on the running staging instance before any routing change.

### 1. AI conversation persistence
- [ ] `ai_conversations` + `ai_conversation_messages` exist in Postgres (`\dt`).
- [ ] Sending a Command Center message returns `{conversationId}`; the thread
      reappears after reload; messages persist across an app restart.
- [ ] A second user in the same org **cannot** see the first user's threads
      (creator-private) — confirm via two sessions.

### 2. Action approval / rejection
- [ ] A write tool returns a **pending** proposal (202), never auto-runs.
- [ ] Approve runs the **server-stored** args (client cannot substitute payload).
- [ ] Confirming twice fails (single-use); a proposal past its TTL is `expired`.
- [ ] Reject records `ai.action.rejected` and never executes.
- [ ] Cross-tenant / cross-user confirm is refused.

### 3. Member role restrictions
- [ ] A `member` session cannot confirm/reject write proposals (403).
- [ ] Owner-only surfaces (Usage & Settings / provider key) are hidden and
      403 at the API for members/admins as designed.
- [ ] An AI Employee's tools never exceed the acting role (allowlist ∩ role).

### 4. API-key secrecy
- [ ] Saving a provider key returns **no key material**; GET settings exposes
      only status/fingerprint — never the raw key (check HTML, JS, logs, JSON).
- [ ] A blank key field on save does **not** erase the stored key.
- [ ] Remove requires the explicit confirm dialog; audit records no secret.

### 5. Knowledge Base isolation
- [ ] Tenant A cannot retrieve Tenant B's collections/documents/chunks.
- [ ] Grounded answers cite only in-tenant sources; empty when nothing matches.

### 6. Signup / login / password reset
- [ ] Signup creates org + owner; login issues a session cookie; logout revokes.
- [ ] Password-reset email link uses the **server-resolved canonical host**
      (not a forged `Host`), and completes a reset.

### 7. Stripe billing / webhooks
- [ ] Checkout/subscription create against the **live** keys in `~/aecloud/.env`.
- [ ] Webhook endpoint verifies the Stripe signature and updates plan state.
- [ ] Plan allowance caps gate platform-key AI usage; BYO-key bypasses caps.

### 8. Email delivery
- [ ] SMTP send succeeds from the tenant outbox (live transport); message
      appears in the outbox with correct branded from-address.

### 9. Rate limiting
- [ ] Confirm the current state of **auth/login rate limiting** (docs disagree:
      `05_PRODUCT_ROADMAP.md` lists it done; `PROJECT_STATUS.md` lists it
      outstanding). **Do not cut over until this is confirmed present** — verify
      by hammering `/auth/login` and observing throttling, or implement it.

### 10. Database backup
- [ ] `~/aecloud/backup.sh` produces a fresh dump in `~/aecloud/backups/`.
- [ ] **Restore is tested** into a scratch database (restore has historically
      never been exercised — do it once before go-live).

**Gate:** all Phase A boxes checked (and #9 resolved) → request owner approval
to proceed to Phase B.

---

## Phase B — Cutover (ONLY after explicit owner approval)

> Every step here changes public-facing routing. Take the pre-change snapshot
> first; each step lists its rollback.

### Pre-change snapshot
- [ ] `cp allelitecloud.com/.htaccess allelitecloud.com/.htaccess.pre-cutover`
      (and the same for any subdomain docroot touched).
- [ ] Fresh app + DB backup: `~/aecloud/backup.sh` and a `dist` tarball.

### 11. Root-domain reverse proxy
- [ ] Append a **managed proxy block** to `allelitecloud.com`'s docroot
      `.htaccess`, mirroring the working `os` block — preserve the cPanel PHP
      block and `.well-known`:
      ```apache
      # BEGIN All Elite Cloud reverse proxy (managed)
        RewriteEngine On
        RewriteRule ^\.well-known/ - [L]
        RewriteRule ^(.*)$ http://127.0.0.1:3300/$1 [P,QSA,L]
      # END All Elite Cloud reverse proxy (managed)
      ```
- [ ] `curl -I https://allelitecloud.com/login` → 200 from the app (not a
      directory listing).
- **Rollback:** restore `.htaccess.pre-cutover`; the static docroot returns.

### 12. Wildcard tenant subdomains
- [ ] DNS: `*.allelitecloud.com` A/AAAA → the server IP (`192.227.127.66`).
- [ ] cPanel: a **wildcard subdomain** (`*.allelitecloud.com`) whose docroot
      carries the same proxy block, so `‹slug›.allelitecloud.com` reaches the
      app and `PLATFORM_BASE_DOMAIN=allelitecloud.com` resolves tenants by slug.
- [ ] `curl -I https://demo.allelitecloud.com/` routes to the app; an unknown
      slug returns the app's tenant-not-found path (not Apache).
- **Rollback:** remove the wildcard subdomain / DNS record.

### 13. AutoSSL certificate coverage
- [ ] AutoSSL covers `allelitecloud.com`, `www`, **and** the wildcard (wildcard
      certs need DNS-01 — confirm the provider issues it; otherwise per-tenant
      certs on demand).
- [ ] `.well-known/acme-challenge` is excluded from the proxy (step 11) so
      issuance/renewal succeeds.
- [ ] Browser padlock valid on root + a sample tenant subdomain; expiry > 30d.
- **Rollback:** none needed (additive); if issuance blocks, keep staging.

### 14. Forwarded host/protocol headers
- [ ] App trusts the proxy (`trust proxy` / equivalent) so `X-Forwarded-Proto`
      and `X-Forwarded-Host` are honored behind Apache `mod_proxy`.
- [ ] Canonical-host logic (reset links, tenant resolution) sees the real
      external host, not `127.0.0.1:3300`.
- [ ] CSRF guard's `Host`/`X-Forwarded-Host` allowlist includes the new
      public hosts (root + wildcard).
- **Rollback:** covered by proxy rollback (step 16).

### 15. Secure cookies
- [ ] `PLATFORM_SECURE_COOKIE=true` in `~/aecloud/.env`; restart; confirm the
      session cookie is `Secure; HttpOnly; SameSite=Lax` over HTTPS.
- [ ] HSTS header present on HTTPS responses.
- **Rollback:** revert the env value + restart (staging tolerated `false`).

### 16. Proxy rollback (rehearsed, ready)
- [ ] One-command revert documented and tested **before** go-live:
      restore `allelitecloud.com/.htaccess.pre-cutover`, remove the wildcard
      subdomain, and (if needed) roll the app back:
      ```bash
      cd ~/aecloud && tar xzf backups/predeploy-<ts>.tgz    # app rollback
      # restart via the stdin-piped script (never inline pkill — self-match)
      ```
- [ ] Confirm production `~/os` (:3200) is **never** part of any step here.

---

## Post-cutover verification
- [ ] Re-run Phase A #1–#10 against the **public** hosts (HTTPS).
- [ ] No mixed-content; secure cookies set; reset links use the public host.
- [ ] Nightly backup ran post-cutover; a restore dry-run still succeeds.
- [ ] `~/os` production unaffected (`os.faithharborwebhosting.com/login` → 200).

## Restart rule (applies to every app restart above)
Never restart with an inline `ssh host 'pkill -f …platformServer.js…'` — the
pattern appears in the wrapper's own argv and self-matches (has caused
downtime). Always pipe the restart script via stdin: `cat restart.sh | ssh …
'bash -s'`, matching `nodejs24/bin/node dist/platform/platformServer.js`.

## Revision history
| Version | Date | Author | Notes |
|---|---|---|---|
| 1.0 | 2026-07-28 | All Elite Cloud Operations | Initial checklist; commit `3ec024e` deployed to staging (`:3300`), CI green, cutover pending owner approval |

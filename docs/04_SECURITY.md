# 04 — Security

Every decision here exists to protect tenants from each other and the platform
from abuse. Where a choice has a *why*, it's stated.

## Tenant isolation (the core guarantee)

- Every tenant-owned row carries `organization_id`.
- `TenantScopedRepository.tenantId()` reads the current org from
  `TenantContext` and **throws if absent** — a missing context fails closed
  (no query runs) rather than open (a cross-tenant query).
- Every repository query includes `WHERE organization_id = <it>` **explicitly**
  and visibly, rather than relying on hidden magic — in a security-critical
  layer, a filter you can see in each query is safer than one you must trust.
- The browser never supplies `organization_id`. Identity comes only from the
  authenticated server-side session → `TenantContext`.
- *Why:* a shared database is efficient and simple, but only safe if isolation
  is impossible to forget. Fail-closed + explicit filters make a leak require
  active, visible malpractice rather than an omission.

## AsyncLocalStorage usage

`TenantContext` is an `AsyncLocalStorage` store holding `{ organizationId }`.
`runWithTenant()` establishes it: the tenant middleware wraps each authenticated
request; background workers and public flows (drip tick, form submit) set it
explicitly per tenant so all downstream repository calls are scoped.

## Session handling

Sessions are **server-side and revocable**: a random 256-bit token maps to a
stored session row with expiry. Logout or compromise can be revoked
immediately. *Why:* stateless JWTs can't be revoked before expiry; for a
business platform, immediate revocation matters more than statelessness.

## Password hashing

`scrypt` (memory-hard, built into Node — no dependency) with a per-password
random salt; the cost is stored in each hash so old hashes still verify. Test
runs use a lower cost to avoid CPU starvation. Reset tokens store only a
SHA-256 **hash** of the token, so a DB leak reveals no usable secret.

## Authorization model

Three roles (owner/admin/member) enforced in the **service/API layer** via
`requireRole(...)`, never only in the UI. Platform admins use a separate
authentication surface (`aec_admin`) and never a tenant session. Portal users
(`aec_portal`) are scoped to their own client within their org.

## Cookie configuration

httpOnly (page JS can't read the token), `SameSite=Lax`, `Secure` in
staging/prod (`PLATFORM_SECURE_COOKIE=true`), `Path=/`, explicit expiry.

## CSRF protections

Two layers. First, the session cookie is `SameSite=Lax` and host-only, which by
itself stops a cross-site page from driving a POST/PATCH/DELETE with the
victim's cookie. Second, a **CSRF guard** (`security/CsrfGuard.ts`) runs on the
authenticated, state-changing surfaces — the tenant API (`/api/platform`), the
client portal (`/portal/api`), and the admin console (`/platform/admin/api`).
For unsafe methods it rejects (403 `CSRF_BLOCKED`) any request the browser
marks `Sec-Fetch-Site: cross-site`, or whose `Origin` host doesn't match a host
we serve (checking both `Host` and `X-Forwarded-Host`, since the app sits
behind the cPanel proxy). It deliberately allows requests carrying neither
header — same-origin form posts, non-browser Bearer-token API clients, and
older browsers — for which `SameSite=Lax` remains the backstop. *Why this shape:*
`Sec-Fetch-Site` is set by the browser and can't be forged cross-site, and it's
unaffected by the reverse proxy, so it's a reliable primary signal without the
token plumbing (and its regression risk) a synchronizer-token scheme would add.

The public form-submit endpoint is intentionally cross-origin (embeddable) and
is NOT behind the guard; it creates only low-trust submissions and stores only
known field keys.

## Security response headers

Every response carries `X-Content-Type-Options: nosniff`,
`X-Frame-Options: SAMEORIGIN` (anti-clickjacking), `Referrer-Policy:
strict-origin-when-cross-origin`, and `X-Permitted-Cross-Domain-Policies: none`.
When behind HTTPS (`PLATFORM_SECURE_COOKIE=true`) it also sends
`Strict-Transport-Security: max-age=31536000; includeSubDomains`. No global CSP
is set (the dashboard is self-contained inline HTML/JS); the one place
untrusted HTML is served — the AI website preview — sets its own strict sandbox
CSP.

## SQL injection protections

**Parameterized queries only** (`$1, $2, …`) everywhere; no string
interpolation of user input into SQL. Dynamic filters (search, activity range)
build parameter lists, never inline values.

## File upload protections

MIME **allowlist** (never extension-based); per-file size cap and per-tenant
quota checked before writing; storage keys are random tenant-prefixed UUIDs
(never derived from the filename → no path traversal or collision); display
names sanitized; `LocalStorageProvider` refuses any resolved path outside its
root; downloads are tenant-scoped and served with `Content-Disposition:
attachment` + `X-Content-Type-Options: nosniff`. **To do:** virus-scanning
integration point.

## AI safety rules

AI generation runs on the tenant's own key when provided; usage is metered and
capped per plan. Knowledge Base answers are **grounded** strictly in retrieved
chunks and return empty when nothing matches — the service never fabricates
content, and retrieval is tenant-scoped so one tenant can never surface
another's documents.

### AI action approvals (write tools)

An AI Employee can only ever do **less** than the acting user's role allows —
the Command Center intersects the employee's tool allowlist with the role-
permitted set, and employee tool names are validated server-side against the
real registry (`INVALID_TOOL`). Read tools run immediately; any tool that
changes data is recorded as a **pending proposal** and never runs until a human
approves it. Confirmation is hardened against the classic approval-bypass
attacks:

- **Single-use + anti-TOCTOU:** confirmation atomically claims the row
  `pending → executing` (`UPDATE … WHERE status='pending' RETURNING`), so two
  concurrent confirmations can't both execute.
- **Expiry:** a proposal expires after `proposalTtlMs` (default 1h); a stale
  proposal is marked `expired` and refused rather than run.
- **Role re-authorization:** the acting role is re-checked at confirm time (in
  addition to the route's `requireRole`), so a member can't confirm an
  owner/admin write even if the proposal already exists.
- **Payload binding:** the tool executes the **server-stored** name and args
  captured at proposal time; the client cannot substitute a payload on confirm.
- **Tenant binding:** proposals are tenant-scoped, so a cross-tenant id is
  invisible and unconfirmable.
- **Audit + activity:** every proposal/execution/rejection is recorded
  (`ai.action.proposed/executed/failed/rejected`, `ai.knowledge.document.
  added/removed`) — never with secrets, document text, hidden prompts, or
  chain-of-thought.

### AI provider keys are write-only

A tenant's own provider key is **write-only from the browser's perspective**: it
is stored server-side and **never returned** to the client, never embedded in
HTML/JS/logs/errors/activity metadata. The settings form shows only status and a
short fingerprint. Submitting a **blank** key does **not** erase a stored key;
removal is a distinct, explicitly-confirmed action. *Outstanding:* keys are not
yet encrypted at rest (pending a KMS decision — see
`## Outstanding` and `07_DECISIONS.md`).

## Host-header safety

Password-reset links are built from the tenant's **canonical host resolved
server-side** (`<slug>.<baseDomain>`), forced HTTPS — the request `Host` header
is never trusted. *Why:* a forged Host would otherwise let an attacker poison
the emailed reset link and steal the token.

## Webhooks

Stripe webhooks are mounted before `express.json()` and verified against the
**raw** body with `node:crypto` before any payload field (including the org id
we act on) is trusted.

## Rate limiting

An in-memory fixed-window `RateLimiter` (`src/platform/security/RateLimiter.ts`)
guards every sensitive authentication endpoint. Exceeding a limit returns **429**
with a `Retry-After` header and a uniform `{error:{code:"RATE_LIMITED"}}` body.

**Exact limits and keys** (all windows 15 min):

| Endpoint | Limit(s) | Key |
|---|---|---|
| `POST /auth/login` | 10 / IP+email **and** 30 / IP | account bucket (cleared on that account's success) + wider IP bucket (never cleared, so spray stays bounded even when some logins succeed) |
| `POST /auth/signup` | 10 / IP | per-IP only — adding the email would give each probed address its own bucket, enabling unbounded account enumeration via the "already in use" 409 |
| `POST /auth/forgot-password` | 5 / IP+email | identical response whether or not the email exists (no enumeration) |
| `POST /auth/reset-password` | 10 / IP **and** 5 / IP+token-fingerprint | per-IP bounds token brute-force across many tokens; the token bucket bounds hammering one token. The token key is a **SHA-256 fingerprint** — the raw reset token is never a key, stored, or logged |
| `POST /auth/change-password` | 10 / user | authenticated; bounds current-password guessing in a hijacked session |

**Proxy-aware IP.** `app.set("trust proxy", 1)` — trust exactly one hop (the
cPanel proxy), not the whole `X-Forwarded-For` chain, so a client can't spoof
`X-Forwarded-For` to forge `req.ip`. **This is only safe because the app binds
to `127.0.0.1` (loopback)** and is reachable solely through Apache — see
`platformServer.ts` (`PLATFORM_BIND_HOST`, default `127.0.0.1`). If the port
were public (`0.0.0.0`), a client could connect directly, bypass Apache, and
forge the forwarded IP. *Go-live check: confirm the port is not publicly
reachable.*

**Auditing.** Every 429 is recorded as `auth.rate_limited` (scope + IP only —
never a password, token, or account). Audit is best-effort; ensure the audit
service is wired in the production composition.

**Durability — go-live constraint.** The store is an in-memory `Map`:
per-process and reset on restart. This is correct for the **single-process**
deployment today (the keepalive watchdog runs exactly one instance). Horizontal
scaling (multiple workers) would let an attacker get the limit *per worker*, so
the deployment **must remain single-process** until the store is swapped for a
shared one (Redis/Postgres) behind the same interface.

**Operational override / recovery.** To clear a limit that has locked out a
legitimate user (e.g. the owner): a successful login already clears that
account's bucket automatically; otherwise wait out the 15-min window, or restart
the platform process (`keepalive.sh` mechanism), which clears all in-memory
buckets. There is no way to exceed a limit by spoofing IPs while the app is
loopback-bound behind the proxy.

## Audit logging

A dedicated, **append-only** security audit trail
(`src/platform/audit/`) records who did what, when, and from where —
distinct from the business activity spine. Recorded actions include
`auth.login` / `auth.login_failed` (with IP), `auth.password_changed`,
`auth.password_reset`, `user.role_changed`, and `user.removed`. Records are
tenant-scoped and never updated or deleted (tamper-evident). Owners/admins view
them at `GET /api/platform/audit` and in the dashboard's Security audit log
panel. Recording is best-effort — it never blocks or fails the audited action.
*Why:* accountability and incident investigation require a trustworthy trail
separate from mutable business data. **Still to expand:** admin cross-tenant
actions, more mutation coverage.

## Secret management

All secrets (DB, SMTP, Stripe, AI keys) live only in `~/aecloud/.env` on the
server, never in the repo. Responses never expose internal identifiers like file
storage keys.

## Outstanding (must precede "production-ready")

1. ~~Login/auth rate limiting~~ ✅ done (auth endpoints; extend to more
   endpoints as needed).
2. Postgres **Row-Level Security** as a defense-in-depth backstop under the
   app-layer isolation. **Deferred by decision (2026-07-27)** to its own focused
   effort: done correctly it needs `FORCE RLS` + per-table policies + a
   per-connection `app.current_org` GUC set on the same pooled connection each
   query runs on (connection-pinned transactions threaded through the base
   repository), plus exemptions for pre-tenant and cross-tenant-worker paths.
   The in-memory test suite can't cover the RLS path, so it's live-proof-only —
   hence its own careful session. App-layer isolation remains the tested
   primary guarantee in the meantime.
3. ~~Audit logging~~ ✅ done for auth + team actions (expand coverage over
   time).
4. ~~CSRF for state-changing tenant routes~~ ✅ done — `Sec-Fetch-Site`/`Origin`
   guard on the authenticated mutating surfaces (see CSRF protections above).
5. ~~Automated backups~~ ✅ daily `pg_dump` + off-box mirror (see
   `10_DEPLOYMENT.md`); still to do: periodically test a full restore.

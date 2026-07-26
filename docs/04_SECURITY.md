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

SameSite=Lax mitigates cross-site POST CSRF for the cookie surfaces. The public
form submit endpoint is intentionally cross-origin (embeddable) and creates
only low-trust submissions; it stores only known field keys. **To do:** add
explicit CSRF tokens / origin checks for state-changing tenant routes as part
of the hardening pass.

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
content. (Phase 3 AI Command Center will add: no mutation without a previewed,
explicitly-confirmed action; per-tool permission + tenant checks; full audit of
every AI request/proposed action/execution; never generate or run raw SQL.)

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
guards authentication endpoints, keyed by client IP + target email so both
spray (many accounts, one IP) and focused (one account) brute-force are
bounded: **login** 10 attempts / 15 min, **forgot-password** 5 / 15 min.
Exceeding returns **429** with `Retry-After`. `app.set("trust proxy", 1)` — we
trust exactly one hop (the cPanel proxy), not the whole `X-Forwarded-For`
chain, so a client can't spoof `X-Forwarded-For` to forge `req.ip` and mint a
fresh bucket per request. *Why:*
credential-stuffing and reset-spam are the most common attacks on an auth
surface. In-memory is correct for the single-process deployment; a
multi-instance deployment swaps the store behind the same interface.

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
   app-layer isolation.
3. ~~Audit logging~~ ✅ done for auth + team actions (expand coverage over
   time).
4. CSRF tokens for state-changing tenant routes.
5. ~~Automated backups~~ ✅ daily `pg_dump` + off-box mirror (see
   `10_DEPLOYMENT.md`); still to do: periodically test a full restore.

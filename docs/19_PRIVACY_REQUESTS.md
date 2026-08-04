# Phase 5 — Privacy Request Intake & Management

Isolated release on `feature/privacy-request-workflow` (from `22c898f`). **Not
deployed.** Reuses existing patterns (tokens, rate limiting, CSRF, host
resolution, audit, tenant scoping); no competing subsystem.

## Architecture & platform-vs-tenant distinction

Two request **destinations**, decided by the **server** from the trusted
resolved host — never a client-supplied id or body field:

- **platform** — about All Elite Cloud itself (account/billing/security/auth/
  platform processing). Originates from the **apex** host (`baseDomain` or
  `www.baseDomain`). `organization_id` is `NULL`. Managed only by authorized
  platform administrators (`aec_admin`).
- **tenant** — about a tenant's own customers/contacts/visitors/CRM/etc.
  Originates from a **resolved** tenant subdomain (`<slug>.<baseDomain>`) or a
  **verified** custom domain. `organization_id` is set. Managed by that
  tenant's owner/admin (and platform admins only for genuine operational
  support).

**Host boundary (fail-closed):** intake creation classifies the host —
apex → platform, resolved tenant → tenant, **anything else (unknown/forged/
malformed) → 404**. An unknown host is never silently treated as platform. The
`baseDomain` fallback is used only for **safe link generation**, not as
authorization to accept an invalid host. Verify/status pages are **token-gated**
(the host only affects branding).

## Data model (additive migration only)

Reuses the Phase-1 `privacy_requests` table; Phase 5 adds columns **and never
alters existing ones**:

| Reused column | Phase 5 meaning |
|---|---|
| `id`, `organization_id` (NULL for platform), `type` (=category), `email`, `details` (=description), `status`, `assigned_to`, `created_at`, `updated_at` | as-is |

Added (`ADD COLUMN IF NOT EXISTS`): `destination`, `name`, `relationship`,
`verification_state`, `verify_token_hash`, `verify_expires_at`,
`status_token_hash`, `resolution_summary`, `due_date`, `due_date_source`,
`verified_at`, `acknowledged_at`, `completed_at`, `denied_at`, `closed_at`,
`purge_after`. Plus: idempotent FK `organization_id → organizations(id) ON
DELETE CASCADE` (tenant deletion cascades its requests; platform requests keep
`NULL` and are unaffected), token-hash indexes, and a `privacy_request_notes`
table (`id, request_id → privacy_requests ON DELETE CASCADE, visibility, author_id, body, created_at`).

**Personal information** lives in: `email`, `name`, `details` (description),
`relationship`, and requester-facing notes. Access is scoped (see permissions).
**No raw tokens are ever stored** — only SHA-256 hashes.

## Lifecycle & enforced transitions

`pending_verification → received → identity_verification_required / in_review /
awaiting_requester → fulfilled / partially_fulfilled / denied / withdrawn /
closed`. The full allowed-transition map is enforced **server-side**
(`ALLOWED_TRANSITIONS`); any other transition fails safely. `pending_verification
→ received` happens **only** via email verification, not a manual status change.
Substantive decisions (`fulfilled`/`partially_fulfilled`/`denied`) require a
**human-written explanation** and are confirmed in the UI. Transitions are
idempotent (a no-op to the current status has no side effects).

## Permissions matrix

| Actor | Platform requests | Tenant requests (own org) | Other tenants |
|---|---|---|---|
| Public (unauth) | submit + verify + status (token) | submit + verify + status (token) | — |
| Tenant **member** | none | **none** (may contain PII) | none |
| Tenant **owner/admin** | none | full manage | **denied (fail-closed)** |
| **Platform admin** (`aec_admin`) | full manage | operational-support only | operational-support only |

Cross-tenant access is denied and fail-closed. A client-submitted
`organizationId`/`destination` is ignored (server derives from host/session).

## Token design

- **Verification token** — 256-bit random, emailed once, **single-use** and
  **time-limited (72 h)**; only its SHA-256 hash is stored; cleared on use.
  Verifying confirms **email control**, not full identity.
- **Status token** — a separate, unguessable, revocable capability minted **on
  successful verification**; hash-only storage; lets the requester view a
  **redacted** status page (reference, category, verification, status,
  requester-visible messages, timestamps — **no** internal notes, staff
  identities, audit data, other requests, or system ids). Predictable ids never
  retrieve status.

Raw tokens appear **only** in the outbound email, never in responses, logs,
audit metadata, or test reports.

## Rate limiting, CSRF, enumeration

- Public submit: per-**IP + normalized-email** limiter (5 / 10 min) →
  `429` + `Retry-After`, independent of the auth limiters.
- CSRF: the existing header/origin `csrfGuard` on the submit + all management
  writes.
- Enumeration-resistant: submit returns a **generic** message and never reveals
  whether an email matches a user/lead/tenant.

## Email behavior

Uses `PlatformEmailService.sendQuietly` (best-effort — never throws). Events:
verification link (on submit) and requester notifications on
`awaiting_requester`/`fulfilled`/`partially_fulfilled`/`denied`. Emails carry a
reference + lifecycle status only — **no** description, internal notes, or
tokens. Delivery failure is represented honestly (the request is preserved; the
requester is not told an email was sent that wasn't). Links use the trusted
apex / tenant canonical host. **Known limitation:** platform-request emails send
without a tenant outbox scope; if the transport requires a tenant, delivery is a
best-effort no-op (documented, not silently claimed as sent).

## Audit & data minimization

Significant actions are audited with **compact metadata only**: request id,
organization id (when applicable), destination, category, previous/new status,
action enum, actor id, timestamp. **Never** the requester's name/email/
description/notes, tokens, or exported data. Tenant actions → tenant
`AuditService`; platform actions → structured `[privacy-audit]` logs.

## Retention actually enforced

The `privacy_requests` FK cascades on **tenant deletion** (a tenant's requests
are removed with the org). There is **no** automated time-based purge job for
privacy requests yet; `purge_after` is a metadata field for a future scheduled
purge. Requests are retained per the Privacy Policy ("privacy-request records …
retained up to 3 years") as an operational policy, not an automated code path.
Backups are unchanged by this phase.

## Manual-fulfillment boundaries

Phase 5 **manages** requests and evidence; it does **not** perform destructive
data operations. No automatic deletion, account termination, hard deletion of
financial/security/audit/legal-acceptance/billing records, database-wide export,
or backup purge. Every substantive fulfillment is a human decision recorded with
a written explanation. No statutory deadline is invented; due dates are tracked
operationally and labelled `staff` or `policy`.

## Known limitations

- No automated per-class retention purge (metadata + operational policy only).
- Platform-request email delivery depends on the transport supporting a
  non-tenant context (best-effort).
- Requester status link cannot be re-issued in update emails (the raw status
  token is only known at verification); update emails ask the requester to use
  their saved status link.
- No read-only data-discovery helper in this phase (deferred; would be
  read-only + tenant-scoped when added).

## Deployment & rollback

Additive migration only (safe on the live schema; the `privacy_requests` table
already exists). Deploy is the established single-process restart; rollback is
the prior `dist` archive + (if ever needed) leaving the additive columns in
place (harmless when unused). **Not deployed pending owner approval.**

## Status / changelog

- `41ceef6` intake + verification + tenant management API + tests.
- `b192c12` fix: host-header injection into the verification link (HIGH).
- `964971d` fail-closed host boundary for intake creation.
- (this commit) platform-admin API + management UIs + email events + docs.
- Platform legal V1.0, Stripe, email, DNS, Apache, `~/os`, port 3200 untouched.

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

## Token design & leak-safe transport

Two capabilities, both 256-bit random, **hash-only** storage (SHA-256), raw
value only ever in outbound email:

- **Verification token** — emailed once, **single-use** (its hash is cleared on
  first use, so a replay is simply invalid), **72 h** expiry. Confirms **email
  control**, not full identity.
- **Status token** — a separate, unguessable, **revocable** capability minted on
  successful verification (rotated by a resend, which invalidates the prior
  verify token). Grants a **redacted** status view only (reference, category,
  verification, status, requester-visible messages, timestamps — never internal
  notes, staff identities, audit data, other requests, or system ids).

**Leak-safe transport (never a query string).** Apache's `combined` LogFormat
records the full request target (`%r`), so a token in a query string would land
in the access log — and in browser history, `Referer`, copied URLs, and
screenshots. This build never puts a token in a query string or the visible URL:

- Email links carry the token in the **URL fragment** (`…/verify#v=<token>`,
  `…/status#s=<token>`). Browsers **never send the fragment to the server**, so
  it cannot reach an Apache/proxy access log or a `Referer` header.
- `GET /privacy-request/verify` and `GET /privacy-request/status` serve a
  **neutral exchange page** containing no token. Tightly-scoped inline script
  reads the fragment, **immediately strips it** with `history.replaceState`, and
  **POSTs it in a request body** to exchange it. GET verify consumes nothing
  (safe for email link-scanners/prefetchers); the single-use consumption is the
  POST.
- The exchange sets a **Secure, HttpOnly, SameSite=Strict** status-session
  cookie (`pr_status`, path `/privacy-request/status`) and the browser lands on
  the **clean, token-free** `/privacy-request/status`, rendered server-side. The
  cookie is never exposed to JS and is not recorded by `combined` logging.
- A `<noscript>` manual-code form is the JS-free fallback — the pasted code goes
  in the POST body, never a URL.
- Token-processing pages send `Referrer-Policy: no-referrer`,
  `Cache-Control: no-store, private`, `X-Robots-Tag: noindex, nofollow,
  noarchive`, `X-Content-Type-Options: nosniff`, plus `<meta name="robots">` and
  `<meta name="referrer" content="no-referrer">`, and load **no third-party
  assets, analytics, or trackers** (fully self-contained HTML).

Verified end-to-end through an Apache-`combined`-format logging proxy (see
"Browser & leak verification"): the raw token appears in **none** of the access
log, the post-load document URL/history, outgoing `Referer`, response bodies,
application logs, audit records, or stored DB fields (only hashes are stored).

## Rate limiting, CSRF, enumeration

- Public submit: per-**IP + normalized-email** limiter (5 / 10 min) →
  `429` + `Retry-After`, independent of the auth limiters. Resend has its own
  tighter limiter (3 / 15 min / (ip,email)).
- CSRF: the header/origin `csrfGuard` on submit, resend, the verify/status
  token-exchange POSTs, and all management writes.
- Enumeration-resistant: submit and resend return a **generic** message and
  never reveal whether an email matches a user/lead/tenant/request.

## Email behavior & failure recovery

Best-effort delivery (never throws into intake), with **honest, persisted
delivery state** so a failed verification email can't silently strand a request.

- **Persisted state** on each request: `verify_email_state`
  (`pending` → `sent` | `logged` | `failed`), `verify_email_error` (short,
  non-PII), `verify_email_attempts`, `verify_email_last_at`. `sent` is recorded
  only when a **connected** transport accepts the message; `logged` when no
  provider is configured (**recorded, not delivered — never claimed as sent**);
  `failed` on a transport error, with the reason stored (never a token/PII).
- **Owner/admin visibility:** the delivery state travels on the management
  detail record, so owner/admin (tenant) and platform admins can see a failed or
  never-configured send.
- **Requester-facing response stays generic** ("if the details are valid, a
  verification email is on its way") — it never asserts delivery succeeded and
  never reveals whether the email matched anything (no enumeration).
- **Rate-limited resend** — `POST /privacy-requests/resend` (host-classified,
  CSRF-guarded, 3 / 15 min / (ip,email)). It finds the most-recent still-
  **unverified** request for that email in scope and **rotates** its
  verification token (fresh single-use token + new 72 h expiry; the old link
  stops working). It **never creates a duplicate request**, never changes
  lifecycle, and returns the **same generic** response whether or not a match
  existed. Already-verified requests are left untouched.
- **Idempotent retries:** re-verifying is a no-op after success (single-use);
  resend rotates rather than duplicates. Notifications on
  `awaiting_requester`/`fulfilled`/`partially_fulfilled`/`denied` carry a
  reference + lifecycle status only — no description, notes, or tokens.
- **Outbox coupling fixed:** the outbox write in `PlatformEmailService.send` is
  now best-effort, so a transport-confirmed status is returned even for a
  platform (no-tenant) message instead of being turned into a throw. Delivery
  state therefore reflects the **transport** outcome, not the outbox write.

## Durable platform audit

Tenant privacy actions record to the tenant-scoped `AuditService` (durable,
`audit_events`). Platform-admin privacy actions previously wrote a
`[privacy-audit]` **console line only** — not durable or queryable. They now
record to a new **`platform_audit_events`** table via `PlatformAuditService`
(append-only; tenant-neutral, since platform actions have no organization). It
stores **compact enums + identifiers only** — action, actor id, target
type/id, previous/new status, category, note id + visibility, timestamp —
**never** names, emails, descriptions, note bodies, or tokens. Lifecycle
coverage: status transitions and note additions. Queryable and access-controlled
via `GET /platform/admin/api/privacy-requests/:id/audit` (admin session
required; returns no PII).

## Audit & data minimization

Significant actions are audited with **compact metadata only**: request id,
organization id (when applicable), destination, category, previous/new status,
action enum, actor id, timestamp. **Never** the requester's name/email/
description/notes, tokens, or exported data. Tenant actions → tenant
`AuditService`; platform actions → structured `[privacy-audit]` logs.

## Retention — reconciled against the immutable Version 1 Privacy Policy

**The earlier "3-year" statement was wrong and has been removed.** The published
Version 1 Privacy Policy (immutable, owner-accepted) does **not** state any
three-year — or any fixed — retention period for privacy requests. Verbatim, it:

- classifies these records as compliance evidence — *"**Compliance evidence:**
  privacy-request records and legal-acceptance records."*
- retains such data by need, not a timer — *"**Other account and operational
  data** (including … security and audit logs, support records, billing
  records, and legal-acceptance evidence) is retained while your account is
  active and for as long as reasonably necessary … to meet our legal, tax,
  accounting, security, and fraud-prevention obligations."*
- and explicitly declines fixed deletion where retention is required — *"We will
  not delete records we are required to keep for legal, tax, security, or
  fraud-prevention reasons."*

So an **automated 3-year purge would contradict Version 1**, not implement it.
Accordingly there is deliberately **no automated time-based purge** for privacy
requests, and none is invented here:

- **`purge_after`** is a reserved column that is **not populated and not an
  enforcement mechanism** (always null). It is documented as such in the model.
- **Deletion of a person's data on request** is a **human, in-the-loop
  operation** performed by the tenant owner/admin (for tenant requests) or a
  platform administrator (for platform requests) through the management
  workflow, honoring the policy exception for records that must be retained.
  There is no destructive automation (see "Manual-fulfillment boundaries").
- **Tenant deletion** cascades: the `privacy_requests` FK is
  `ON DELETE CASCADE`, and `privacy_request_notes` cascade from the request — so
  a tenant's requests **and their notes** are removed with the organization.
- **Platform requests** have a null `organization_id` and are unaffected by any
  tenant-deletion cascade; they persist as platform compliance evidence.
- **Token hashes** are cleared at end of life anyway: the verify-token hash is
  cleared on first use/rotation; only SHA-256 hashes are ever stored.
- **Backups** are unchanged by this phase and follow the normal backup lifecycle
  described in the Privacy Policy.

There is no separate "retention-overdue" report because there is no retention
deadline to breach; the management list already surfaces operational **due
dates** (labelled `staff` or `policy`) for SLA tracking, which is a distinct
concept from record retention.

## Manual-fulfillment boundaries

Phase 5 **manages** requests and evidence; it does **not** perform destructive
data operations. No automatic deletion, account termination, hard deletion of
financial/security/audit/legal-acceptance/billing records, database-wide export,
or backup purge. Every substantive fulfillment is a human decision recorded with
a written explanation. No statutory deadline is invented; due dates are tracked
operationally and labelled `staff` or `policy`.

## Known limitations

- No automated retention purge — by design (see retention section): these are
  compliance-evidence records with no fixed policy term; deletion-on-request is
  a human, in-the-loop operation.
- The token-exchange flow requires JavaScript for the one-click link; a
  `<noscript>` manual-code form is provided as the JS-free fallback (the code
  is POSTed, never placed in a URL).
- The status session lives in a 90-day sliding `HttpOnly` cookie; the durable
  private link (emailed once as a `#s=` fragment) re-establishes it later. If a
  requester loses both, they submit again.
- No read-only data-discovery helper in this phase (deferred; would be
  read-only + tenant-scoped when added).
- Admin-initiated resend is via the public rate-limited resend flow; there is no
  separate admin resend button (delivery state is surfaced in the admin UI so
  the failure is visible).

## Browser & leak verification

Verified in real Chromium against the in-memory app behind an Apache-`combined`-
format logging reverse proxy. With disposable tokens: the raw token appears in
**none** of the proxy access log request targets, the post-load document URL or
history, the outgoing `Referer`, response bodies, or application logs; the
verify/status pages return `Referrer-Policy: no-referrer`, `Cache-Control:
no-store`, and `X-Robots-Tag: noindex`; verification is single-use; the status
session is an `HttpOnly`/`SameSite=Strict` cookie; back/forward after the
fragment is stripped reveals no token or private status. A before/after
comparison shows the previous query-string design leaked the full token into the
access log and the visible URL.

## Deployment & rollback

Additive migration only (safe on the live schema; the `privacy_requests` table
already exists; new columns + `platform_audit_events` table are additive). Deploy
is the established single-process restart; rollback is the prior `dist` archive +
(if ever needed) leaving the additive columns/table in place (harmless when
unused). **Not deployed pending owner approval.**

## Status / changelog

- `41ceef6` intake + verification + tenant management API + tests.
- `b192c12` fix: host-header injection into the verification link (HIGH).
- `964971d` fail-closed host boundary for intake creation.
- `6ebc97c` platform-admin API + management UIs + email events + docs.
- `3feed68` fix: intake form `window.name` clash (never submitted in-browser).
- (this commit) **security & policy reconciliation**: fragment-token exchange
  + status cookie + anti-leak headers (no token in query/log/Referer/history);
  removed the unsupported 3-year retention claim (V1 has none); honest persisted
  email-delivery state + rate-limited resend with token rotation; durable
  tenant-neutral `platform_audit_events` replacing the console audit line.
- Platform legal V1.0, Stripe, email, DNS, Apache, `~/os`, port 3200 untouched.

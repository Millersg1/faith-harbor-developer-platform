# Changelog

All notable changes to All Elite Cloud. Dates are UTC. This is the
parallel multi-tenant build (`feature/multitenant-foundation`); production
Faith Harbor OS is unaffected.

## [Unreleased] — Phase 3 in progress (2026-07-26)

### Added
- **Workflow engine** (P3-M1): tenant automations — a trigger (any activity
  event type) starts a run that advances through timed steps, each performing
  a closed-set action (`notify` | `email` | `enroll_sequence` | `note`)
  through an existing service. No arbitrary tenant code executes. Triggered via
  a subscribed `ActivityService` handler; advanced by the existing drip tick
  worker (`workflows.runDue()`). Loop-safe (`workflow.*` events never
  re-trigger). Fully tenant-scoped; the global due-run scan re-enters
  `runWithTenant` per org. `lead.created` / `form.submitted` now carry
  `{email,name}` metadata so steps can email/enroll the contact. API
  `/api/platform/workflows` (+ `/:id`, `/:id/runs`), dashboard **Automations**
  panel (owner/admin, 5 templates), 7 tests. Live-proved on staging
  (trigger → run → notify → completed). Commit `7fac204`.

### Fixed
- **Vitest forks pool** (ADR-011): Vitest 4's default worker pool crashed with
  `Cannot read properties of undefined (reading 'config')` on the Windows dev
  box even on the pinned Vite 7. Set `pool: "forks"` — the full suite (now 887)
  runs locally again. CI/Linux was never affected.

## [Unreleased] — Phase 2 complete + documentation established (2026-07-26)

### Added
- **AI Knowledge Base** (P2-M9): collections → text documents → chunks with
  keyword retrieval and source citations, behind a pgvector-ready
  `RetrievalProvider` abstraction. API `/api/platform/knowledge/*`, dashboard
  panel. Commit `60462b5`.
- **Shared Calendar** (P2-M8): tenant events with UTC-normalized times, range
  queries, record links; agenda dashboard. Commit `089492c`.
- **Forms Builder** (P2-M7): no-code public forms (global slug), submissions,
  auto lead creation, public render + submit endpoints. Commit `1ceecc6`.
- **File Manager** (P2-M6): storage-provider abstraction (local, S3-swappable),
  MIME allowlist, size + quota limits, safe keys, soft delete, authorized
  downloads. Commit `579becc`.
- **Customer Journey Timeline** (P1-M5): per-client/lead activity timeline.
  Commit `28f79db`.
- **Universal Search + Ctrl/Cmd+K Command Palette** (P1-M3/M4). Commit `6834215`.
- **Activity event spine + Notification Center** (P1-M1). Commit `cb0d355`.
- **Autoresponders / drip** with a background tick worker. Commit `969573e`.
- **Password reset** flow over live SMTP. Commit `5d9bc81`.
- **Tenant email service + outbox** (SMTP), wired into invites. Commit `339ec3c`.
- **Living documentation** under `/docs` (this set) + `VISION.md`.

### Changed
- `express.json()` body limit raised to 20 MB to accommodate base64 file
  uploads (File service still caps decoded size well below this).

### Fixed
- **CI actually green** — two causes: (1) test-file type errors under
  `tsconfig.json` (fixed in `884497a`), and (2) a real test failure in
  `drip.test.ts` (enroll-before-step returned 500 not the expected 400 —
  `validationOrNext` didn't recognise the "at least"/"needs a"/"must be"
  phrasings). Broadened the validation matcher; full suite now 880 passing.
- **Pinned Vite to 7** (ADR-010) so the Vitest suite runs locally (Vite 8 broke
  the worker on Windows) — this is how the drip failure was finally caught.

### Security
- **Automated database backups** — daily `pg_dump` → gzip →
  `~/aecloud/backups`, 14-day retention, best-effort off-box mirror to Google
  Drive via rclone; cron `30 3 * * *`. `scripts/aecloud-backup.sh`. Hardening
  pass item 3.
- **Audit logging** — append-only, tenant-scoped security trail
  (`auth.login`/`login_failed`/`password_changed`/`password_reset`,
  `user.role_changed`/`removed`); `GET /api/platform/audit` + dashboard panel
  (owner/admin). Hardening pass item 2.
- **Login + forgot-password rate limiting** (in-memory `RateLimiter`, keyed by
  IP + email; 429 + `Retry-After`) — first item of the hardening pass.
  `trust proxy` enabled so the real client IP is used.
- Password reset links are built from the tenant's canonical host resolved
  server-side (not the request `Host` header) — closes a reset-poisoning
  vector.
- File storage keys are random and tenant-prefixed; provider refuses paths
  escaping its root.
- Forms store only known field keys from public submissions.

### Operational
- Real SMTP delivery live via `hello@allelitecloud.com`.
- Staging runs the drip tick worker every 60s.

## Earlier (pre-2026-07-25, foundation)

Multi-tenant spine (Postgres, `TenantContext`, `TenantScopedRepository`),
3 auth surfaces, signup/login/sessions, white-label branding, custom-domain
verification, Stripe subscriptions, AI website builder + publishing, BYO AI
keys + metering + caps, client portal, team management, platform admin, and the
ported business modules (clients, projects, invoices, tickets, CRM leads,
proposals, campaigns, reviews, brands, products, books, programs, hosting).

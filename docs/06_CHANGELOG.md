# Changelog

All notable changes to All Elite Cloud. Dates are UTC. This is the
parallel multi-tenant build (`feature/multitenant-foundation`); production
Faith Harbor OS is unaffected.

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
- **CI green again** (red 2026-07-22 → 2026-07-25): test files had type errors
  that only `tsc -p tsconfig.json` (which includes tests) caught. Commit
  `884497a`.

### Security
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

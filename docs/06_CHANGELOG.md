# Changelog

All notable changes to All Elite Cloud. Dates are UTC. This is the
parallel multi-tenant build (`feature/multitenant-foundation`); production
Faith Harbor OS is unaffected.

## [Unreleased] — Phase 3 in progress (2026-07-26)

### Added
- **Marketplace — website templates** (P4-M1): a code-defined catalogue of
  industry-specific website templates (restaurant, professional services,
  trades, fitness, boutique, nonprofit) a tenant browses and "uses". Using one
  creates a draft in the AI Website Builder seeded with the template's brief +
  accent color, ready to generate — plan-gated on the site limit exactly like
  a normal website. Closed, code-defined set (no tenant-supplied templates or
  code), same pattern as the plan catalogue and AI tool registry. API
  `/api/platform/marketplace/website-templates` (+ `/:id/use`), dashboard
  **Marketplace** panel. 5 tests. First Phase 4 surface; industry editions and
  installable modules build on this.

### Security
- **CSRF guard + security response headers** (hardening). A CSRF guard
  (`security/CsrfGuard.ts`) protects the authenticated state-changing surfaces
  (`/api/platform`, `/portal/api`, `/platform/admin/api`): unsafe methods are
  rejected (403 `CSRF_BLOCKED`) when the browser marks the request
  `Sec-Fetch-Site: cross-site` or its `Origin` host doesn't match a served host
  (`Host`/`X-Forwarded-Host`, proxy-aware). Requests with neither header are
  allowed — `SameSite=Lax` remains the backstop — so same-origin calls,
  Bearer-token clients, and the test suite are unaffected. Every response now
  also carries `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`,
  `Referrer-Policy`, `X-Permitted-Cross-Domain-Policies`, and (behind HTTPS)
  HSTS. 7 tests.

### Added
- **Invoice mark-paid + `invoice.paid` event** (Phase 3 polish): invoices can
  now be marked paid (`PATCH /api/platform/invoices/:id`, dashboard "Mark paid"
  button). It emits an `invoice.paid` activity event **only on the transition
  into paid** (so an automation can't double-fire), which makes the
  "Invoice paid → notify team" workflow template actually fire — previously
  that trigger was never emitted. Added workflow templates for
  `ticket.created` and `client.created` (both already-emitted events). +2 tests.
- **Expanded the AI tool registry** (Phase 3 polish): the Command Center and
  AI Employees can now do materially more. New read tools —
  `crm.pipeline.summary` (leads grouped by stage + total estimated value),
  `revenue.summary` (invoices paid vs outstanding), `tickets.list`. New
  write tools (still confirmation-gated) — `crm.leads.update_stage`,
  `projects.create`, `tickets.create`. All wrap existing tenant-scoped
  services; the ticket/lead services validate their own enums so the tool's
  string inputs are safe. 4 tests for the default catalogue.
- **AI Employees** (P3-M4): saved, tenant-scoped assistants — each a persona
  plus a whitelisted subset of registry tools (e.g. a "Sales Assistant" limited
  to lead tools). Running the Command Center "as" an employee injects its
  persona and **narrows** the available tools. The security property is
  structural: the console intersects the employee's tool list with the acting
  user's role-allowed set, so an employee can only ever do *less* than the
  role — never more. API `/api/platform/ai/employees` (+ `/:id` PATCH/DELETE)
  and an `employeeId` on the chat endpoint; dashboard **AI Employees** panel
  (owner/admin) + an assistant picker in the Command Center. Table
  `ai_employees`. 7 tests (incl. "a whitelist can't grant tools the role
  lacks"). Live-proved on staging.
- **AI Command Center** (P3-M3): a chat surface where the user asks about their
  business or asks the assistant to do something. The assistant plans with the
  tool registry's descriptors, runs **read** tools itself to gather live data
  (never inventing numbers), and routes **write** tools through the registry —
  so they become pending proposals the user confirms. The model can gather
  information freely but can never change data on its own. Provider-neutral
  chat client (OpenAI/OpenRouter/own key), injectable for tests; runs in the
  caller's tenant scope; usage metered (`console_chat`); bounded plan→act loop.
  API `/api/platform/ai/console/chat`, dashboard **AI Command Center** panel
  (all users; write confirmation gated to owner/admin), 6 tests. Live-proved on
  staging.
- **AI tool registry** (P3-M2): the closed, code-defined catalogue of actions
  an AI surface may take for a tenant. Two safety properties are structural,
  not conventions: the tool set is fixed in code (no tenant can add or run
  arbitrary tool code), and **read tools run on invoke while write tools are
  recorded as pending proposals a human must confirm** before they execute.
  Every tool runs inside the caller's tenant scope through an existing service;
  role-gated; confirmations/rejections audited (`ai.tool.executed` /
  `ai.tool.rejected`). Starter tools: `crm.leads.list`, `clients.list`,
  `projects.list`, `metrics.summary` (read); `crm.leads.create`, `notes.add`,
  `notifications.send` (write). API `/api/platform/ai/tools` (+ `/:name/invoke`,
  `/invocations`, `/invocations/:id/confirm`, `/invocations/:id/reject`),
  dashboard **AI Actions** panel, 10 tests. Table `ai_tool_invocations`.
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

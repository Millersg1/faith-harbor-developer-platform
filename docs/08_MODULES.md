# 08 — Modules

Each module follows the port pattern: entity → repository (`TenantScopedRepository`)
→ service → table → API block in `PlatformApiRouter` → dashboard panel → tests.
Source lives under `src/platform/<module>/`.

## Platform foundation

### Activity / Events (`events/`)
- **Purpose:** shared "something happened" spine.
- **Tables:** activity_events. **Service:** ActivityService (record + fan-out).
- **API:** GET /activity. **Events:** every module emits here.
- **Consumers:** Notifications, Journey Timeline; future Workflows/Webhooks.

### Notifications (`notifications/`)
- **Purpose:** per-user in-app notifications.
- **Tables:** notifications. **Service:** NotificationService +
  NotificationActivityHandler. **API:** /notifications*. **Screens:** topbar
  bell + dropdown. **Permissions:** user-scoped.

### Search (`search/`)
- **Purpose:** universal tenant search across modules.
- **Service:** SearchService (aggregates module `list()`s). **API:** /search.
  **Screens:** Ctrl/Cmd+K command palette. **Future:** SQL-backed ranking.

### Files (`files/`)
- **Purpose:** secure file management. **Tables:** files. **Service:**
  PlatformFileService + StorageProvider (local/memory). **API:** /files*.
  **Screens:** Files panel. **Permissions:** user; restore owner/admin.
  **Future:** S3 provider, virus scan.

### Forms (`forms/`)
- **Purpose:** no-code public forms → submissions → leads. **Tables:** forms,
  form_submissions. **API:** /forms* + public /f/:slug + /api/public/forms/
  :slug/submit. **Screens:** Forms panel + public page. **Events:**
  form.submitted. **Future:** drag-drop editor, more field types.

### Calendar (`calendar/`)
- **Purpose:** tenant events. **Tables:** calendar_events. **API:**
  /calendar/events*. **Screens:** agenda panel. **Future:** grid views,
  external sync.

### Knowledge Base (`knowledge/`)
- **Purpose:** grounded Q&A over tenant docs. **Tables:**
  knowledge_collections/_documents/_chunks. **Service:** KnowledgeService +
  RetrievalProvider. **API:** /knowledge/*. **Screens:** Knowledge panel.
  **Future:** pgvector, PDF/Docx ingest, LLM synthesis.

### Drip / Autoresponders (`drip/`)
- **Purpose:** automated email sequences. **Tables:** drip_sequences/_steps/
  _enrollments. **Worker:** tick every 60s. **API:** /drip/*. **Screens:**
  Autoresponders panel. **Trigger:** manual + lead_created.

### Email (`email/`)
- **Purpose:** tenant email + outbox. **Tables:** emails. **Transport:** SMTP
  or logging. **API:** /emails.

### Platform analytics (`analytics/`)
- **Purpose:** cross-tenant business analytics for the superadmin console — MRR,
  ARR (run-rate), active subscriptions, plan mix, month-to-date platform AI
  cost, and MRR net of AI.
- **How:** `PlatformAnalyticsService` reads every org (`OrganizationService`)
  and every subscription (`SubscriptionRepository.listAll()` — system-only,
  cross-tenant) + `AiUsageRepository.platformCostSinceAll()`. Counts only
  active orgs on an active plan (suspended/canceled excluded; no stored
  subscription = the default entry plan, matching billing's synthesized
  default). **Superadmin-only** (`GET /platform/admin/api/analytics`).

### Platform health (`health/`)
- **Purpose:** an at-a-glance operational health snapshot for the superadmin
  console — database reachability, the background drip/workflow worker's
  liveness, and SMTP / platform-AI-key / Stripe connectivity, plus version and
  uptime.
- **How:** `PlatformHealthService` is pure — it takes injected `HealthChecks`
  (a `pingDb` thunk, connectivity booleans, a `workerLastTickAt` getter,
  interval, `startedAt`, `version`, and an optional `now`) so it's trivially
  unit-tested. `platformServer` wires the real `SELECT 1` ping, `email
  .connected()` / `openAiKey` / `billing.billingConnected()`, and a
  `workerLastTickAt` that the drip tick updates each cycle; the worker reads
  "running" when it ticked within 3 intervals. **Superadmin-only**
  (`GET /platform/admin/api/system-health`).

### Onboarding / Success Center (`onboarding/`)
- **Purpose:** a first-run getting-started checklist on the tenant dashboard —
  add a brand, add a client, launch a website, hire an AI Employee, create a
  campaign, invite a teammate.
- **How:** `OnboardingService` is pure — it takes a signal map (`id →
  () => Promise<boolean>`) and returns the checklist with per-step `done`,
  `completed`/`total`, `percent`, and `allDone`. Steps are a closed, ordered,
  code-defined catalogue; a step is **only shown when its signal is wired**, so
  the checklist never reports progress it cannot measure. The server wires each
  signal over the ambiently tenant-scoped services (branding saved? ≥1 client?
  ≥1 website? ≥1 AI Employee? ≥1 campaign? ≥2 team members?), evaluated inside
  the request context. A signal that throws counts as "not done", never a
  crash. Tenant-scoped (`GET /api/platform/onboarding`); dismissal is a local
  client preference.

### White-label rendering (`branding/brandingTheme.ts`, `invoices/invoiceDocument.ts`, `email/emailLayout.ts`)
- **Purpose:** carry a tenant's brand into documents and channels that leave the
  dashboard — printable invoices, outbound email, the client portal.
- **How:** `brandingTheme.ts` holds shared pure helpers (`escapeHtml`,
  `brandName`, `brandAccent`, `brandLockupHtml`, `brandSupportEmail`) with safe
  fallbacks to the platform brand and strict validation — colors must be
  `#rrggbb`, logos must be `https://…` before they're placed in CSS/`<img>`.
  `invoiceDocument.renderInvoiceDocument()` builds a self-contained, print-ready
  HTML invoice (served at `GET /api/platform/invoices/:id/printable`, owner/
  admin); "Save as PDF" is the browser's native print — no server-side PDF
  engine (a deliberate choice for the shared host). `emailLayout
  .renderBrandedEmailHtml()` wraps a plain body in a table-based branded HTML
  email; the dashboard email composer sends multipart HTML+text (`html`
  threaded additively through `EmailMessage`/transports, plain body always
  preserved). The **portal** fetches `GET /portal/api/branding` (behind the
  portal session) and applies logo/accent/name client-side. Every tenant/client
  value is escaped.

### Dashboard summary (`dashboard/`)
- **Purpose:** the tenant Home "Command Center" — a single aggregate of real,
  tenant-scoped metric counts plus a billing summary, so the browser makes one
  call instead of downloading every list to count it.
- **How:** `DashboardService` is pure — it takes injected count getters and a
  billing getter and returns `{ metrics, billing }`. A metric whose getter is
  omitted (module not wired) is **`null`** (honest "unavailable", never a
  misleading zero); a getter that throws is also `null`. The router wires the
  getters over the ambiently tenant-scoped services (open tickets by real
  status, active projects by status, websites via `count()`), and adds a
  request-scoped `canManage` (owner) to the billing summary. **No MRR** — the
  billing model has no reliable per-tenant revenue. No Stripe IDs are exposed.
  Tenant-scoped (`GET /api/platform/dashboard`).

### Workspace preferences (`preferences/`)
- **Purpose:** shared, per-organization dashboard preferences (currently the
  onboarding "dismissed" flag) — server-persisted, not browser-only.
- **How:** `OrganizationWorkspacePreferences` is a per-org singleton following
  the branding/AI-settings pattern (`organization_workspace_preferences` table,
  `TenantScopedRepository`, safe defaults when unset). `GET
  /api/platform/preferences` is readable by any workspace user; **`PATCH`
  requires owner/admin** (`requireRole`) because these are shared workspace
  settings. The dashboard "Hide" persists `onboardingDismissed`; a member's
  reopen is session-only.

### Websites & Website workspace (`websites/`, `web/pages.ts`)
- **Purpose:** AI-generated tenant/client websites plus the reorganized
  **Website workspace** UI (server-rendered, in `web/pages.ts`).
- **UI:** the `web` dashboard section renders an accessible sub-navigation
  (`role="tablist"`, deep-linked via `#web/<sub>`, back/forward + arrow keys):
  **My Websites** (default), Create Website, AI Employee Marketplace, Website
  Templates, Hosting & Domains, Branding. Only the active sub-section renders;
  Website panels are full-width (`grid-column: 1/-1`) so the builder no longer
  stretches beside the catalog. Install/use actions go through a focus-trapped
  confirmation dialog stating exactly what is created/changed.
- **Provenance:** `PlatformWebsiteRecord` carries optional `sourceTemplateId` /
  `sourceEditionId` (stable ids, not names). Template `use` sets the template
  id; edition `apply` sets the edition id + its template id; direct builds leave
  both null. Additive migration; existing rows stay valid.
- **Generation idempotency:** `PlatformWebsiteService.generate(id, key?)` claims
  a durable per-website lock (`WebsiteGenerationLockRepository` →
  `website_generation_locks`, atomic `ON CONFLICT DO NOTHING`) so two
  concurrent/duplicate requests can't both run and double-meter AI usage — the
  loser gets `GenerationInProgressError` (409). A later regeneration is a new
  op. AI usage is metered exactly once per successful generation.
- **Marketplace apply is explicit:** the edition `apply` route only changes
  org branding when the request carries `applyBranding: true` (server-validated,
  default off), and returns an accurate result (website, employeesCreated vs
  employeesRequested — best-effort). Activity events cover the meaningful
  lifecycle. Hosting/domain records never expose credentials or tokens as
  secrets; SSL is described as an AutoSSL policy with a neutral post-verify
  status (no live cert-status field yet).

### Marketplace (`marketplace/`)
- **Purpose:** a code-defined catalogue a tenant browses and installs from — the
  first Phase 4 surface. `MarketplaceCatalog` holds `WEBSITE_TEMPLATES`
  (industry-specific starter sites: brief + accent color).
- **Use flow:** "use" a template → creates a draft in the AI Website Builder
  seeded with its brief/color (via `PlatformWebsiteService`), plan-gated on the
  site limit like any website. Closed set — no tenant-supplied templates/code.
- **Industry editions:** `INDUSTRY_EDITIONS` — one-click bundles (restaurant,
  professional services, fitness) that reference a website template + accent +
  suggested AI employees. "Apply" creates the website draft (plan-gated,
  required), sets the brand accent, and creates the employees (best-effort,
  additive — never deletes). Composes `PlatformWebsiteService` + `BrandingService`
  + `AiEmployeeService`.
- **Premium tier:** items may be `tier: "premium"` — gated by **plan** (a
  `premiumTemplates` flag, unlocked on Business+), not a per-template charge.
  Using/applying a premium item on a lower plan → `402 PREMIUM_REQUIRED`. Free
  items are unaffected. 17 templates + 17 editions (4 premium).
- **API:** /marketplace/website-templates (+ /:id/use), /marketplace/editions
  (+ /:id/apply). **UI:** dashboard **Marketplace** panel (Premium badge).
  **Next:** installable modules.

### AI Employees (`ai/employees/`)
- **Purpose:** saved, reusable assistants — a persona plus a whitelisted subset
  of registry tools (e.g. a "Sales Assistant" scoped to lead tools).
- **Safety:** running the Command Center "as" an employee **narrows** the tool
  set — the console intersects the employee's whitelist with the acting user's
  role-allowed tools, so an employee can never grant access the role lacks.
- **Pieces:** `AiEmployeeService` (CRUD + validation), `AiEmployeeRepository`
  (tenant-scoped). **Tables:** ai_employees. **API:** /ai/employees (+ /:id
  PATCH/DELETE) and an `employeeId` on /ai/console/chat. **UI:** dashboard **AI
  Employees** panel (owner/admin) + assistant picker in the Command Center.

### AI Command Center (`ai/console/`)
- **Purpose:** a chat surface that answers questions about the business and
  takes actions — the human-facing front end of the tool registry.
- **How it works:** builds tool specs from the registry (role-filtered), calls
  a provider-neutral chat client (`ChatClient`: OpenAI/OpenRouter/own key,
  injectable), and loops plan→act up to a bounded number of rounds. **Read
  tools it runs itself; write tools go through `AiToolService` and become
  pending proposals the user confirms** — the model can never change data on
  its own. Runs in the caller's tenant scope; usage metered (`console_chat`);
  honest when no key is configured (reports unavailable, doesn't fake).
- **Pieces:** `ChatClient` (+ `OpenAiChatClient` / `DisconnectedChatClient` /
  `createChatClient`), `AiConsoleService`.
- **API:** /ai/console/chat. **UI:** dashboard **AI Command Center** panel (all
  users; write confirmation gated to owner/admin).

### AI tools (`ai/tools/`)
- **Purpose:** the closed, code-defined registry of actions an AI surface may
  take for a tenant — the foundation the AI Command Center and AI Employees
  build on.
- **Safety model:** the tool set is fixed in code (no tenant adds or runs
  arbitrary tool code). **Read tools execute on invoke; write tools are
  recorded `pending` and only run when a human confirms.** Every tool runs in
  the caller's tenant scope through an existing service; tools are role-gated;
  confirm/reject are audited.
- **Pieces:** `AiToolRegistry` (register/describe/validate), `AiToolService`
  (invoke → run-or-propose, confirm, reject), `AiToolInvocationRepository`
  (tenant-scoped history + pending proposals), `buildDefaultAiTools` (starter
  catalogue).
- **Tables:** ai_tool_invocations. **API:** /ai/tools (+ /:name/invoke,
  /invocations, /invocations/:id/confirm|reject). **UI:** dashboard **AI
  Actions** panel (owner/admin).
- **Catalogue (`buildDefaultAiTools`):** reads — `crm.leads.list`,
  `clients.list`, `projects.list`, `tickets.list`, `metrics.summary`,
  `crm.pipeline.summary`, `revenue.summary`; writes (confirm-gated) —
  `crm.leads.create`, `crm.leads.update_stage`, `projects.create`,
  `tickets.create`, `notes.add`, `notifications.send`. Each wraps an existing
  tenant-scoped service.

### Workflows (`workflows/`)
- **Purpose:** tenant automations — a trigger starts a run that advances through
  timed steps, each running a closed-set action through an existing service.
- **Trigger:** any activity-event type (e.g. `lead.created`, `form.submitted`),
  matched by a subscribed `ActivityService` handler. Loop-safe: `workflow.*`
  events are ignored.
- **Actions:** `notify` (Notification Center), `email` (tenant email, with
  `{{name}}`/`{{email}}` personalization), `enroll_sequence` (drip), `note`
  (activity record). No arbitrary tenant code runs.
- **Worker:** `runDue()` on the shared drip tick (default 60 s) scans due runs
  across all tenants and re-enters `runWithTenant` per org to advance each.
- **Tables:** workflows, workflow_runs (JSONB steps/log). **API:** /workflows
  (+ /:id, /:id/runs). **UI:** dashboard **Automations** panel (owner/admin).

## Auth & identity
- **Auth** (`auth/`): password hashing, requireUser/requireRole, password
  reset. **Sessions** (`sessions/`), **Users** (`users/`), **Signup**
  (`signup/`), **Portal** (`portal/`), **Admin** (`admin/`).

## Business modules
Clients, Projects, Invoices, Support tickets, CRM leads, Proposals, Marketing
campaigns, Reviews, Brands, Products, Books (publishing), Programs (ministry),
Hosting accounts, Domains, Websites (AI builder), Billing (Stripe), AI settings
+ usage. Each: standard REST + dashboard panel + tests; most link to a client
and emit journey activity.

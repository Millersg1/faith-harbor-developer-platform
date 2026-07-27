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

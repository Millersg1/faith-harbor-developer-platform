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

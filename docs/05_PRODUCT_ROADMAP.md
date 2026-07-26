# Product Roadmap

Prioritized. Effort is rough (S/M/L/XL). Status: ✅ done · 🚧 in progress ·
⏳ planned. All work is on `feature/multitenant-foundation` (staging).

## Completed ✅

| Feature | Effort | Notes |
|---|---|---|
| Multi-tenant spine (TenantContext, scoped repos) | XL | Fail-closed |
| Auth: 3 cookie surfaces, scrypt, revocable sessions | L | |
| Password reset over SMTP | M | Host-injection hardened |
| Business modules (clients…hosting, 13) | XL | Ported |
| Stripe subscriptions (5 tiers) | L | Live-capable |
| AI website builder + custom-domain publish | L | |
| BYO AI keys + usage metering + plan caps | M | |
| Tenant email + outbox (live SMTP) | M | |
| Drip autoresponders + tick worker | M | |
| P1: Activity spine + Notification Center | L | Dep for timeline/workflows |
| P1: Universal Search + Command Palette | M | |
| P1: Customer Journey Timeline | M | |
| P2: File Manager | L | Storage abstraction |
| P2: Forms Builder | L | Public capture → leads |
| P2: Shared Calendar | M | Agenda view |
| P2: AI Knowledge Base | L | Keyword retrieval + citations |
| **Hardening pass** | M | Rate limiting, audit logging, daily backups |
| P3-M1: Workflow engine + Automations UI | XL | Trigger→timed steps→closed-set actions; live-proved |
| Living documentation (`/docs`) | M | Established 2026-07-26 |

## Next Release 🚧 / ⏳ (recommended order)

| Feature | Priority | Effort | Depends on | Notes |
|---|---|---|---|---|
| AI tool registry + Command Center (P3) | P1 | XL | modules, KB | Read tools free; write tools require confirmation |
| AI Employees (P3) | P2 | L | tool registry | Role-based assistants |
| Workflow engine v2 (P3) | P2 | M | workflow engine | Visual builder, more triggers, retries/idempotency |
| Postgres RLS backstop + CSRF (hardening) | P1 | M | — | Deferred from the hardening pass |

## Future ⏳

| Feature | Priority | Effort | Notes |
|---|---|---|---|
| Module marketplace foundation (P4) | P2 | L | First-party only |
| Industry editions / blueprints (P4) | P2 | L | Configure, don't fork |
| Website template marketplace (P4) | P2 | L | AI into tested layouts |
| Analytics dashboard (P5) | P1 | L | MRR, conversion, etc. |
| White-label enhancements (P5) | P2 | M | PDFs, portal, emails |
| Platform Health Center (P5) | P2 | M | Subscription/email/domain health |
| Success Center + onboarding (P5) | P2 | M | Edition-based checklist |
| Outbound webhooks (P6) | P2 | L | Signed, SSRF-guarded |
| Public API v1 (P6) | P2 | L | Hashed tokens, scopes, rate limits |

## Long Term

- pgvector-backed semantic retrieval for the Knowledge Base.
- Real WHM/cPanel hosting + mailbox provisioning.
- Stripe customer portal + Stripe Tax + dunning.
- React (or modularized) front end replacing the single `pages.ts`.
- External calendar sync (Google / Microsoft 365).

## Ideas (unscheduled)

- Full-text + PDF/Docx ingestion for the Knowledge Base.
- Drag-and-drop form field editor.
- Calendar month/week/day grid views.
- Super-admin cross-tenant analytics (MRR, AI cost vs revenue).

# Project Status Dashboard

_Last updated: 2026-07-26 · Branch: `feature/ai-console` (staging)_

## Completion (rough, honest estimates)

| Area | % | Notes |
|---|---|---|
| Overall | ~55% | Strong foundation + Phases 1–2 done; Phases 3–6 + hardening remain |
| Backend | ~65% | Core + 20+ modules; workflows/webhooks/public-API pending |
| Frontend | ~50% | Server-rendered `pages.ts` dashboard; functional, not React |
| Database | ~70% | All current modules have tables + indexes; no down-migrations |
| Authentication | ~85% | 3 cookie surfaces, scrypt, revocable sessions, password reset |
| Authorization | ~75% | Service-layer role guards; RLS backstop pending |
| Billing | ~70% | Stripe subscriptions (live-capable); customer portal + tax pending |
| Website Builder | ~78% | Reorganized Website workspace (6 accessible sub-sections); generate (durably idempotent) + publish to verified domain; AI-employee packages vs standalone templates clearly separated; provenance persisted |
| White-label | ~65% | Branded printable invoices + branded emails + branded client portal (P5-M4); per-doc PDF theming beyond invoices pending |
| AI | ~76% | BYO keys (write-only), metering, caps, KB retrieval; redesigned AI workspace (5 accessible sub-sections); Command Center with persisted, creator-private conversations; Employees with a registry-driven tool picker; hardened write approvals (single-use, expiry, role re-auth, payload/tenant binding). Debt: key encryption at rest, durable chat idempotency, richer KB ingestion |
| Automation | ~70% | Drip + workflow engine (trigger→timed steps→actions) live; visual builder + more triggers pending |
| Marketplace | ~20% | Website-template catalogue live (P4-M1); industry editions + installable modules pending |
| Analytics | ~40% | Superadmin MRR/plan-mix/AI-cost (P5-M1) + system-health panel (P5-M2, live DB/worker/SMTP/AI/Stripe); per-tenant dashboards pending |
| Onboarding | ~65% | Tenant Success Center checklist (P5-M3), now conditional/auto-collapsing with a server-persisted dismiss preference; edition-specific steps + guided tours pending |
| Tenant dashboard (Home) | ~75% | Operational Command Center — real metric cards, quick actions, activity, compact billing, accessible progress, AA-contrast tokens, white-label contrast guard |
| Forms | ~80% | Public forms + submissions + lead capture; drag-drop editor pending |
| Calendar | ~55% | Agenda + CRUD; grid views + external sync pending |
| Knowledge Base | ~55% | Collections/docs/chunks/keyword retrieval + citations; pgvector + LLM synthesis pending |
| Testing | ~55% | 970 tests; **runnable locally again** (Vitest `forks` pool, ADR-011) + CI + live proofs |
| Documentation | ~40% | This `/docs` set established 2026-07-26; being back-filled |
| Security review | Not done | Login rate-limit, RLS, audit logging outstanding |

## Current milestone

**Phase 5 complete.** Superadmin analytics (P5-M1), system-health panel
(P5-M2), the tenant Success Center / onboarding checklist (P5-M3), and
white-label polish — branded printable invoices, emails, and client portal
(P5-M4) — are all shipped and live-proved on staging. Phase 3, the hardening
pass, and Phase 4 marketplace (website templates + industry editions) are
complete.

## Next milestone

Phase 6 (outbound webhooks, public API). The deferred hardening — **Postgres
RLS backstop**, periodic restore test — remains recommended before broadening
the tenant surface further.

## Known technical debt

- **Local test runner is fragile** on the dev machine: `npm install`
  re-blocks esbuild's binary (re-run `node node_modules/esbuild/install.js`
  after installs) and Vitest 4 needs the `forks` pool (ADR-011). With both in
  place the full suite (887) runs locally; also verified via `typecheck` +
  `build` + live proofs + CI (Linux).
- **UI is one large `pages.ts`** server-rendered file — growing; not the React
  system the long-term roadmap assumes. Needs a modularization/framework
  decision.
- **No down-migrations / rollback** for schema (additive `CREATE TABLE IF NOT
  EXISTS` only).
- **FOLLOW-UP: live AutoSSL status.** SSL is provisioned/renewed by the hosting
  infra's AutoSSL, but the domain record has no SSL field and the app doesn't
  query AutoSSL. The Website workspace states the AutoSSL policy and shows a
  neutral "AutoSSL provisioning expected" after verification — it never claims a
  live "SSL Active". Wiring a real AutoSSL-status read (via the hosting/cPanel
  API) is a named follow-up.
- **FOLLOW-UP: website/hosting `sites` limit accounting.** Websites and hosting
  accounts both count against the plan `sites` limit but tally independently.
  Product intent (one combined entitlement vs separate keys vs a
  hosting↔website relationship) is unconfirmed, so enforcement was deliberately
  left unchanged in the Website redesign. Decide the rule from plan docs before
  changing billing semantics.
- **Timestamps stored as TEXT ISO** (UTC) rather than `timestamptz`.
- **Sandbox has no outbound network to api.github.com** — CI can't be polled
  from the dev environment; verified by pushing + checking Actions in the UI.

## Security items outstanding (must precede "production-ready")

- Login/auth rate limiting (brute-force protection).
- Postgres Row-Level Security as a defense-in-depth backstop.
- Comprehensive audit logging of security-relevant actions.
- Automated database backups + documented restore.

## Critical bugs

None known open. (CI was red Jul 22–25 due to test-file typecheck errors;
fixed in `884497a`.)

## Upcoming work

Phase 3 (automation + AI ops), Phase 4 (marketplace + industry editions),
Phase 5 (analytics, white-label, health, onboarding), Phase 6 (webhooks, public
API), plus the hardening pass and production cutover to `allelitecloud.com`.

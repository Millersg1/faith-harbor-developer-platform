# Project Status Dashboard

_Last updated: 2026-07-26 · Branch: `feature/multitenant-foundation` (staging)_

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
| Website Builder | ~70% | Generate + publish to verified domain; template marketplace pending |
| AI | ~40% | BYO keys, metering, caps, KB retrieval; Command Center/Employees pending |
| Automation | ~55% | Drip + tick worker done; workflow engine pending |
| Marketplace | 0% | Not started (Phase 4) |
| Forms | ~80% | Public forms + submissions + lead capture; drag-drop editor pending |
| Calendar | ~55% | Agenda + CRUD; grid views + external sync pending |
| Knowledge Base | ~55% | Collections/docs/chunks/keyword retrieval + citations; pgvector + LLM synthesis pending |
| Testing | ~50% | Extensive tests written; **not runnable locally** (esbuild blocked); rely on CI + live proofs |
| Documentation | ~40% | This `/docs` set established 2026-07-26; being back-filled |
| Security review | Not done | Login rate-limit, RLS, audit logging outstanding |

## Current milestone

Phase 2 complete (File Manager, Forms, Calendar, Knowledge Base). Documentation
established.

## Next milestone

Recommended: **hardening pass** (login rate-limiting, Postgres RLS backstop,
audit logging) before Phase 3, then Phase 3 (Workflow engine → AI tool registry
→ AI Command Center → AI Employees).

## Known technical debt

- **Local test runner broken** on the dev machine (npm allow-scripts blocks
  esbuild's binary → Vitest workers fail). Tests verified via `typecheck` +
  `build` + live HTTP/in-process proofs, and run on CI (Linux).
- **UI is one large `pages.ts`** server-rendered file — growing; not the React
  system the long-term roadmap assumes. Needs a modularization/framework
  decision.
- **No down-migrations / rollback** for schema (additive `CREATE TABLE IF NOT
  EXISTS` only).
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

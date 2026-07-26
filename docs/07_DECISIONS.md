# 07 — Architecture Decision Records

Append-only. Never rewrite an old decision; add a new one that supersedes it.

---

## ADR-001 — Parallel multi-tenant build (strangler), not a rewrite

**Date:** 2026-07 · **Problem:** Turn single-tenant Faith Harbor OS into a
multi-tenant white-label SaaS without risking the live product.
**Alternatives:** in-place refactor of the live app; greenfield separate repo.
**Decision:** build the platform as a separate process/app in the same repo,
against its own database, deployed alongside production.
**Reasoning:** production is never destabilized; shared code can be reused.
**Trade-offs:** some duplication; two apps to run. **Implications:** clean
cutover to `allelitecloud.com` when complete.

## ADR-002 — Shared DB + `organization_id` with fail-closed context

**Date:** 2026-07 · **Problem:** isolate tenants safely and simply.
**Alternatives:** database-per-tenant; schema-per-tenant.
**Decision:** shared tables with `organization_id`, `AsyncLocalStorage`
`TenantContext`, `TenantScopedRepository` that throws without context, explicit
`WHERE organization_id` in every query. **Reasoning:** operationally simple,
cheap, and safe when isolation can't be silently forgotten. **Trade-offs:** no
hard DB boundary yet (mitigate later with RLS). **Implications:** RLS is a
planned defense-in-depth backstop.

## ADR-003 — Server-rendered vanilla-JS dashboard (`pages.ts`)

**Date:** 2026-07 · **Problem:** ship a working UI fast without a build
pipeline. **Alternatives:** React SPA; server-rendered templates.
**Decision:** generate self-contained HTML+JS from `pages.ts`.
**Reasoning:** zero build step, dependency-light, fast to iterate.
**Trade-offs:** the file grows large; not componentized; harder to scale UI
complexity. **Implications:** a future ADR will likely modularize or adopt a
framework once UI complexity warrants it.

## ADR-004 — Dependency-light integrations (no SDKs)

**Date:** 2026-07 · **Problem:** Stripe, SMTP, AI without heavy deps on a
cPanel host. **Decision:** raw HTTP + `node:crypto` for Stripe; raw net/tls for
SMTP; OpenAI-compatible HTTP for AI. **Reasoning:** nothing new to install on
the server; fewer supply-chain risks. **Trade-offs:** we maintain more protocol
code. **Implications:** stable, self-contained deployment artifact.

## ADR-005 — Base64-in-JSON file uploads (v1), storage-provider abstraction

**Date:** 2026-07 · **Problem:** file uploads without a multipart parser
dependency. **Decision:** accept base64 in JSON (20 MB body limit; 10 MB
decoded cap), store via a `StorageProvider` (local now). **Reasoning:** avoids a
new dependency; keeps a clean seam for S3 later. **Trade-offs:** ~33% payload
overhead; not ideal for very large files. **Implications:** swap in
multipart/streaming + S3 when needed, behind the same interface.

## ADR-006 — Keyword retrieval for the Knowledge Base (pgvector later)

**Date:** 2026-07 · **Problem:** grounded Q&A over tenant docs without a vector
DB yet. **Decision:** `RetrievalProvider` interface with a keyword
implementation over Postgres. **Reasoning:** delivers cited retrieval now;
embedding-agnostic so pgvector drops in later. **Trade-offs:** keyword recall <
semantic. **Implications:** planned `PgVectorRetrievalProvider`.

## ADR-007 — Activity event spine as shared foundation

**Date:** 2026-07 · **Problem:** notifications, timeline, and (later) workflows
and webhooks all need "something happened" events. **Decision:** one
`ActivityService.record()` funnel that persists + fans out to handlers.
**Reasoning:** build once, reuse; decouples producers from consumers.
**Trade-offs:** an extra indirection. **Implications:** workflows/webhooks
subscribe rather than re-instrumenting modules.

## ADR-008 — Timestamps as UTC ISO text (not `timestamptz`)

**Date:** 2026-07 · **Decision:** store times as ISO-8601 UTC strings for
consistency with existing tables. **Trade-offs:** weaker native date ops than
`timestamptz`; lexicographic range works for UTC ISO. **Implications:** new
tables may adopt `timestamptz`; a migration could unify later.

## ADR-011 — Vitest `forks` pool (Windows worker stability)

**Date:** 2026-07-26 · **Problem:** Even on the pinned `vite@7`, Vitest 4's
default worker pool crashed with `Cannot read properties of undefined (reading
'config')` at the first `describe()` on the Windows dev machine, so the suite
again could not run locally (CI/Linux unaffected). **Alternatives:** float Vite
within v7 (7.3.6 reproduced it); rely on CI only. **Decision:** set
`test.pool = "forks"` in `vitest.config.ts` — child processes instead of worker
threads. **Reasoning:** the full suite (887) runs cleanly under forks locally
and on CI; local runs are the pre-push gate that catches failures before they
reach CI. **Trade-offs:** forks are marginally slower to start than threads.
**Implications:** complements ADR-010; revisit both when Vitest supports Vite 8.

## ADR-010 — Pin Vite to 7 (Vitest runner stability)

**Date:** 2026-07-26 · **Problem:** With `vite@8`, the Vitest 4 worker failed
to initialize on the Windows dev machine (`Cannot read properties of undefined
(reading 'config')`), so the suite could not be run locally — features were
verified only via typecheck/build/live-proofs, and a real test failure
(`drip.test.ts` returning 500 vs an expected 400) slipped through to CI.
**Alternatives:** keep vite@8 and rely on CI only; switch pool config.
**Decision:** pin `vite@^7` (vitest@4's officially supported major).
**Reasoning:** the full suite (880 tests) runs cleanly on v7 locally and on CI;
being able to run tests locally is essential to catch failures before pushing.
**Trade-offs:** not on the newest Vite. **Implications:** revisit when Vitest
officially supports Vite 8.

## ADR-009 — Documentation as Definition of Done

**Date:** 2026-07-26 · **Decision:** `/docs` is living documentation; no feature
is done until docs, changelog, roadmap, and status are updated. **Reasoning:**
keeps knowledge synchronized with the code as the surface grows.

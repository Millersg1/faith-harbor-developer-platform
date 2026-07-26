# 14 — Developer Guide

Onboarding for engineers working on All Elite Cloud.

## Architecture in one minute

Multi-tenant Express + TypeScript app over shared PostgreSQL. Tenancy is
enforced by `TenantContext` (AsyncLocalStorage) + `TenantScopedRepository`
(fail-closed). UI is server-rendered from `src/platform/web/pages.ts`. See
`01_ARCHITECTURE.md`.

## Repository structure

```
src/
  persistence/PostgresDatabase.ts   # schema (CREATE TABLE IF NOT EXISTS) + PgQueryable
  tenancy/                          # TenantContext, TenantScopedRepository, middleware
  communications/                   # SMTP/Email transports (no SDK)
  platform/
    createPlatformApp.ts            # composition root (routes, middleware, public)
    platformServer.ts               # constructs services + starts server + workers
    PlatformApiRouter.ts            # the tenant API hub
    web/pages.ts                    # server-rendered dashboard + pages
    <module>/                       # entity, repository, service per module
  hosting/, communications/, …      # shared/legacy pieces reused by the platform
docs/                               # this documentation set
```

## Running locally

1. `npm ci`
2. Provide Postgres env (`PG_*`) — or rely on in-memory repos for tests.
3. `npm run build` then `node dist/platform/platformServer.js`, or iterate with
   `tsx`. Dashboard at `http://localhost:3300/`.

> If Vitest fails with a worker `config` error, run
> `node node_modules/esbuild/install.js` and clear `node_modules/.vite`
> (a local esbuild/allow-scripts issue; see `11_TESTING.md`).

## Building & testing

- `npm run typecheck` — **run this before pushing** (CI typechecks test files).
- `npm test` — Vitest.
- `npm run build` — emits `dist/`.
- `npm run validate` — all three (what CI runs).

## Deployment

See `10_DEPLOYMENT.md`. Compiled `dist` shipped over SSH; `keepalive.sh`
watchdog; secrets in `~/aecloud/.env`.

## How to create a module (the port pattern)

1. **Entity** `X.ts` — types + request shapes.
2. **Repository** `XRepository.ts` — extend `TenantScopedRepository`; call
   `this.tenantId()`; explicit `WHERE organization_id`; in-memory fallback.
3. **Service** `XService.ts` — validation + business rules; typed errors;
   optional injected collaborators; `{ now }` for tests.
4. **Schema** — add `CREATE TABLE IF NOT EXISTS x (...)` + indexes in
   `PostgresDatabase.initialize()`.
5. **API** — add `x?: XService` to `PlatformApiDependencies`, a routes block in
   `PlatformApiRouter.ts` (guard mutations with `requireRole`), and pass it
   through `createPlatformApp` **and** the `createPlatformApp({...})` call in
   `platformServer.ts` (don't forget the last step — an omitted optional dep
   compiles fine but 404s at runtime).
6. **UI** — a panel + loaders in `pages.ts`; wire into boot.
7. **Tests** — service + HTTP + tenant isolation + validation + auth.
8. **Docs** — update `02_DATABASE`, `03_API`, `08_MODULES`, `06_CHANGELOG`,
   `05_PRODUCT_ROADMAP`, `PROJECT_STATUS`, and an ADR if a real decision was
   made. Definition of Done.

## How tenant isolation works

The request's session establishes `runWithTenant({ organizationId }, …)`.
Inside, any `TenantScopedRepository` reads that org via `this.tenantId()` (which
throws if missing) and filters every query by it. Public/worker flows set the
scope explicitly per tenant (e.g., form submit resolves the org by the form's
global slug, then enters that org's scope). Never trust `organization_id` from
the client. See `04_SECURITY.md`.

## Gotchas

- Optional deps not passed to `createPlatformApp` → routes silently 404
  (typecheck won't catch it).
- After deploy, a raced restart can serve old code — verify a new route
  responds (`10_DEPLOYMENT.md`).
- Cookies are `Secure`; test the running server over HTTP by sending the token
  as an explicit `Cookie` header.
- Store times as UTC ISO; normalize on write.

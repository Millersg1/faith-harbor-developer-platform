# 12 — Style Guide

Coding standards for All Elite Cloud. Match the surrounding code first.

## Folder structure

`src/platform/<module>/` per module: `XEntity.ts`, `XRepository.ts`,
`XService.ts`, wired into `PlatformApiRouter.ts`, `createPlatformApp.ts`,
`platformServer.ts`. Tests as `src/platform/<name>.test.ts`. Persistence in
`src/persistence/`. Tenancy in `src/tenancy/`. UI in `src/platform/web/pages.ts`.

## Naming conventions

- Files/classes: `PascalCase` (`KnowledgeService`). Functions/vars:
  `camelCase`. DB columns: `snake_case`; map to camelCase in repositories.
- Event types: dotted (`invoice.paid`, `form.submitted`).
- Error codes: `UPPER_SNAKE` slugs.

## Repository pattern

Extend `TenantScopedRepository`. Call `this.tenantId()` at the top of every
method and include `WHERE organization_id = <it>` **explicitly** in every
query. Provide an in-memory `Map`/array fallback (mirrors SQL exactly) so tests
run without a database. Parameterized SQL only. Map rows via a `mapRow` helper;
cast pg rows through `as unknown as RowType` (or an `asRow` helper) to satisfy
strict TS.

## Service pattern

Business rules + validation live here (not in the router). Throw typed errors
(`XValidationError`, `XNotFoundError`) that the API layer maps to status codes.
Inject collaborators (email, activity, leads) as optional constructor deps so
tests can omit them. Accept `{ now }` for deterministic time in tests.

## Express / API pattern

Guard mutations with `requireRole(...)`. Validate required fields with the
shared helpers (`asObject`, `isNonEmptyString`, `optionalString`,
`badRequest`, `validationOrNext`, `notFoundOrNext`). Never expose internal
fields (e.g., file `storedKey`); use a `publicX()` mapper. Emit activity via
`deps.activity?.record(...)` after successful mutations (best-effort, `void`).

## Frontend (pages.ts) standards

Server-rendered strings. Reuse helpers: `api()`, `esc()`, `clear()`,
`emptyMsg()`, `item()`, `field()`, `renderList()`, `setMsg()`. Every panel:
loading, empty, and error states. Escape all user text with `esc()`. Inside the
template literal, write control chars as doubled escapes (`\\u2026`); avoid
backticks and `${`.

## Error handling

Services throw typed errors; the API layer translates. Best-effort side effects
(email, activity) never throw into the triggering action. Background workers
catch per-item so one failure doesn't stop the batch.

## Logging

`console.error` for unexpected failures (goes to `platform.log`). Don't log
secrets or full request bodies. (Structured logging is a future improvement.)

## Validation

Two layers: shape validation in the API (required fields, types) and business
validation in the service (allowlists, ranges, uniqueness).

## Testing expectations

See `11_TESTING.md`. Every module ships isolation + happy-path + validation +
auth tests. Run `npm run typecheck` (tsconfig.json) before pushing.

## Documentation standards

Documentation is part of Definition of Done (ADR-009). Update the relevant
`/docs` files, `06_CHANGELOG.md`, `05_PRODUCT_ROADMAP.md`, and
`PROJECT_STATUS.md` with every feature.

## Git

Small, reviewable commits per milestone. Conventional-commit style
(`feat(platform): …`, `fix(ci): …`). Never commit secrets.

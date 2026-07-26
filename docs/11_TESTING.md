# 11 — Testing

## Frameworks & commands

Vitest. `npm test` (= `vitest run`), `npm run typecheck` (`tsc -p
tsconfig.json`, which **includes** test files), `npm run build` (`tsc -p
tsconfig.build.json`, which **excludes** tests). CI runs `npm run validate` =
typecheck && test && build.

> **Important:** because CI typechecks with `tsconfig.json`, type errors *in
> test files* fail CI even though they don't affect the build. Run
> `npm run typecheck` before pushing, not just `npm run build`. (This exact gap
> made CI red 2026-07-22 → 25.)

## Known local limitation

On the current dev machine the Vitest worker fails to initialize ("Cannot read
properties of undefined (reading 'config')") because an npm allow-scripts policy
blocks esbuild's postinstall binary. Mitigations: `node
node_modules/esbuild/install.js`; clear `node_modules/.vite`. CI (Linux) runs
the suite normally. When the local runner is blocked, features are verified via
`typecheck` + `build` + **live HTTP/in-process proofs** against staging.

## Test categories present

- **Unit / service** — business rules per service (e.g., drip scheduling,
  calendar validation, knowledge chunking/retrieval).
- **Integration (HTTP)** — supertest against `createPlatformApp` with in-memory
  repositories (signup → act → assert).
- **Tenant isolation** — every module test asserts org A cannot see org B's
  data; `runWithTenant` used to prove scoping.
- **Auth/authorization** — unauthenticated calls 401; role-gated routes;
  portal/admin separation.
- **Security-specific** — password-reset host-injection, single-use tokens,
  file MIME/quota/traversal, forms store-only-known-keys, no storedKey leak.

## Live proofs (compensating control)

Because the local runner is blocked, each milestone is additionally proven on
staging against **real Postgres + SMTP**: create a throwaway org, exercise the
feature over HTTP (using the `aec_session` token as an explicit `Cookie` header
since cookies are Secure), assert results, then delete the org. Scripts live in
the session scratchpad; results are recorded in commit messages / status.

## What to test for a new module (checklist)

- [ ] CRUD happy paths (service + HTTP)
- [ ] Validation rejects malformed input (400)
- [ ] Tenant A cannot read/modify Tenant B's rows
- [ ] Missing `TenantContext` fails closed
- [ ] Role guards enforced server-side
- [ ] Plan/quota limits enforced where applicable
- [ ] `npm run typecheck` (tsconfig.json) passes
- [ ] `npm run build` passes

## Outstanding

Performance/load testing; a documented manual QA checklist per module;
regression suite tagging. RLS (when added) needs its own isolation tests.

# Stage 12A — Isolated Runner Proposal (WRITTEN, NO CHANGES MADE)

**This is a proposal only. Nothing has been created, installed, or modified — on
the server or in production. No external NameSilo/Stripe request has been made.
The server-side option (B) will not be built without your explicit approval.**

All external OTE/Stripe testing is on HOLD until you obtain NameSilo sandbox
credentials. The isolated runner exists to run the acceptance harness
(`src/platform/domains/ote/IsolatedOteHarness.ts`) whose fail-closed preflight
(`npm run ote:preflight <env-file>`) must print `READINESS: PASS` before any
external call.

---

## Observed production facts (read-only; nothing touched)

| Fact | Value |
| --- | --- |
| Server user / home | `faithhosting` / `/home/faithhosting` |
| Production app dir | `/home/faithhosting/aecloud` (`0755`, `faithhosting:faithhosting`) |
| Production env file | `/home/faithhosting/aecloud/.env` — **currently `0644`** (owner+world readable) |
| Production ports | `3300` platform (loopback), `3200` Faith Harbor OS, `5432` PostgreSQL (loopback), `80`/`443` Apache (public) |
| Production database | `faithhosting_aecloud`, schema `public`, on `127.0.0.1:5432` |
| Node | v20.20.2 (`/usr/bin/node`) |
| Free disk | ~1.2 TB |
| Server egress IP (for NameSilo whitelist) | **`192.227.127.13`** — confirm at setup with `curl -s https://api.ipify.org` |

The runner must avoid every production port and must never use `faithhosting_aecloud`
or its `public` schema. The preflight already refuses `sk_live_`, the live
NameSilo host, the `public`/production schema, ports `3300`/`3200`, non-loopback
binds, and any enabled mutation.

---

## Option A — Local development runner (FIRST CHOICE, recommended)

The safest option: it involves **zero server changes** and the production `.env`
does not exist on the local machine, so several isolation proofs are trivial.

- **Exact directory:** the existing local working copy, e.g.
  `C:\Users\shawn\faith-harbor-developer-platform`. The secrets file lives at the
  repo root as `ote-acceptance.env` (now git-ignored) — a copy of
  `config/ote-acceptance.env.example`.
- **Process command & port:** `npm run build` once, then
  `npm run ote:preflight ./ote-acceptance.env` (must be `PASS`), then the
  acceptance run drives `IsolatedOteHarness`, which binds **`127.0.0.1` only** on
  `OTE_HARNESS_PORT` (suggest `39117`). Nothing binds a public interface.
- **Database / user / schema:** a **local** disposable PostgreSQL (e.g. a
  throwaway Docker `postgres:16` on `127.0.0.1:5433`), database `ote_scratch`,
  role `ote_tester` (local-only password in the env file), schema
  `ote_acceptance`. It is a different instance entirely from the server's 5432.
- **Filesystem ownership & permissions:** `ote-acceptance.env` owned by your
  local user; restrict its ACL to your account only (Windows: remove inherited
  access, grant only your user; equivalently `chmod 600`).
- **Outbound IP for NameSilo whitelist:** your **local machine's current public
  IP** (`curl -s https://api.ipify.org`). Note it is typically dynamic (home
  ISP) — if it changes, NameSilo OTE must be re-whitelisted.
- **Proof it cannot read production `.env`:** the production `.env` exists only on
  the server; it is not present on the local machine. The harness CLI also
  requires an explicit env-file path and never reads the ambient environment.
- **Proof it cannot connect to production `public` schema:** the harness points at
  `127.0.0.1:5433` (local Postgres). The server's `5432` is bound loopback on the
  server and is not reachable from your machine; the runner is given no route or
  credentials to it. The preflight additionally refuses a URL containing the
  production database name and refuses the `public` schema.
- **Startup:** start local Postgres → `npm run ote:preflight ./ote-acceptance.env`
  → on `PASS`, run the acceptance suite.
- **Shutdown:** stop the harness process; stop/remove the local Postgres
  container.
- **Cleanup:** `DROP SCHEMA ote_acceptance CASCADE;` (or drop the throwaway
  container/volume); delete `ote-acceptance.env`.
- **Resource limits:** local; optionally cap the Docker container
  (`--memory=512m --cpus=1`) and run Node with `--max-old-space-size=256`.
- **Apache / public reachability:** not applicable — a local machine with no
  Apache proxy; the harness binds loopback only and is never publicly reachable.

---

## Option B — Server-side isolated instance (SECOND CHOICE — REQUIRES YOUR EXPLICIT APPROVAL)

Only if a local runner is unworkable. **I will not create any of this without your
approval.** The commands below are the proposed setup for a hosting admin.

- **Exact directory:** a NEW dir `/home/faithhosting/ote-acceptance`, separate
  from `~/aecloud`, mode `0700`. It holds a checked-out copy of the built
  harness + `ote-acceptance.env`.
- **Process command & port:** `node scripts/ote-preflight.mjs
  /home/faithhosting/ote-acceptance/ote-acceptance.env` (must be `PASS`), then the
  harness bound **`127.0.0.1`** on a port that is NOT `3300/3200/5432/80/443`
  (suggest **`3390`**). Started manually (no systemd unit, no Apache vhost),
  stopped by PID.
- **Database / user / schema:** a NEW, separate database + least-privilege role,
  created by an admin:

  ```sql
  CREATE ROLE ote_tester LOGIN PASSWORD '<set-at-setup>';
  CREATE DATABASE ote_acceptance_db OWNER ote_tester;
  \connect ote_acceptance_db
  CREATE SCHEMA ote_acceptance AUTHORIZATION ote_tester;
  -- ote_tester gets NO grant on faithhosting_aecloud (verify with \du + \dp).
  REVOKE ALL ON DATABASE faithhosting_aecloud FROM ote_tester;
  ```

  `OTE_PG_URL` points at `ote_acceptance_db` as `ote_tester`; `OTE_PG_SCHEMA =
  ote_acceptance`.
- **Filesystem ownership & permissions:** `~/ote-acceptance` `0700`;
  `ote-acceptance.env` **`0600`**, owned by the runner user.
- **Outbound IP for NameSilo whitelist:** `192.227.127.13` (confirm at setup).
- **Proof it cannot read production `.env`:** **this is the key caveat.** The
  production `.env` is currently `0644`, so any process running as `faithhosting`
  can read it. To *prove* the runner cannot, ONE of these is required (your
  choice, admin action, separate approval):
  1. **Preferred:** create a dedicated OS user `otetest` (needs root/hosting
     admin) that has no read access to `/home/faithhosting/aecloud/.env`; run the
     harness as `otetest`. Then OS permissions enforce it.
  2. Tighten `/home/faithhosting/aecloud/.env` to `0600` — but that is a
     **production change** and needs its own explicit approval.

  Independently of OS permissions, the harness loader never reads the production
  env (it requires an explicit non-production file), but that is convention, not
  an OS guarantee — hence the caveat above. **Recommendation: use Option A, or
  Option B with a separate `otetest` user.**
- **Proof it cannot connect to production `public` schema:** `ote_tester` holds no
  privileges on `faithhosting_aecloud` (admin verifies with `\dp`); it lives in a
  separate database + non-`public` schema; the preflight refuses `public` and any
  URL containing the production database name.
- **Startup:** `preflight` → `PASS` → launch the harness (loopback:3390) →
  acceptance run.
- **Shutdown:** kill the harness PID (it also `.unref()`s and has no timers in
  disabled mode).
- **Cleanup:** `DROP SCHEMA ote_acceptance CASCADE; DROP DATABASE
  ote_acceptance_db; DROP ROLE ote_tester;` then `rm -rf ~/ote-acceptance`.
  Any unavoidable residual OTE object at NameSilo is documented in the ledger
  (OTE may not support deletion).
- **Resource limits:** run under a memory cap, e.g.
  `systemd-run --scope -p MemoryMax=512M node --max-old-space-size=256 …`
  (or `ulimit -v 786432` before launch); single process, loopback socket.
- **Apache / public reachability:** the harness binds `127.0.0.1:3390` only —
  not `0.0.0.0`, not a public interface. No Apache vhost/`ProxyPass` references
  `3390`; confirm no vhost proxies to it. It is therefore not publicly reachable.

---

## Where you will enter each secret (once approved + NameSilo supplies the account)

- **Option A:** `<repo>/ote-acceptance.env` (git-ignored; ACL/`chmod 600`).
- **Option B:** `/home/faithhosting/ote-acceptance/ote-acceptance.env` (`0600`).

Copy `config/ote-acceptance.env.example` to that path and fill in each value with
a local editor — **never paste secrets into chat.** Then run
`npm run ote:preflight <that-file>` and confirm `READINESS: PASS`. Only then will
I proceed (in your specified separate commits) with the actual Stage 12A external
testing, and stop at the Stage 12A report.

Values to enter (names only): `RUN_DOMAIN_OTE_ACCEPTANCE=1`,
`NAMESILO_OTE_ENDPOINT` (host `ote.namesilo.com`), `NAMESILO_OTE_API_KEY`,
`STRIPE_DOMAIN_TEST_SECRET_KEY` (`sk_test_…`), `STRIPE_DOMAIN_TEST_WEBHOOK_SECRET`,
`DOMAIN_CONTACT_ENC_KEY_V1` (+ active version), `DOMAIN_BLIND_INDEX_KEY_V1` (+
active version), `OTE_PG_URL`, `OTE_PG_SCHEMA`, `OTE_CONFIRM_DISPOSABLE=1`,
`OTE_HARNESS_PORT`, `OTE_BIND_HOST=127.0.0.1`.

---

## Summary recommendation

Use **Option A (local runner)** — zero server changes, trivial isolation proofs,
and it fully exercises the harness. Reserve **Option B** for when a local runner
is impossible, and then only with a dedicated `otetest` OS user so
"cannot read production `.env`" is enforced by the OS rather than by convention.
No further action is taken until you approve a runner and NameSilo issues the
sandbox account.

# Security Finding + Remediation Plan — production `.env` permissions

**NOTHING WAS CHANGED. This is a recorded finding + a no-content-change
remediation PLAN that requires your separate explicit approval to execute. It is
NOT part of Stage 12A and no `chmod` was performed.**

## Finding

- File: `/home/faithhosting/aecloud/.env` (production All Elite Cloud).
- Observed mode: **`0644`** (`-rw-r--r--`), owner `faithhosting:faithhosting`
  (read-only observation, `ls -l`).
- Risk: the file contains production secrets (Stripe **live** key, NameSilo live
  key, DB password, webhook secret, encryption keyring). `0644` makes it readable
  by ANY local user/process on the host, not just the owner. It should be
  **`0600`** (`-rw-------`).

## Remediation plan (permissions only — content untouched)

Execute only with your explicit approval, in this order. It changes ONLY the mode
bit; it never edits, moves, or re-encodes the file.

1. **Pre-checks (read-only, record evidence):**
   - `stat -c '%a %U:%G' ~/aecloud/.env` → expect `644 faithhosting:faithhosting`.
   - `sha256sum ~/aecloud/.env` → record the checksum (content baseline).
   - Confirm the app runs as the owner so `0600` stays readable:
     `ps -o user= -p "$(pgrep -f 'dist/platform/platformServer.js' | head -1)"`
     → expect `faithhosting` (owner ⇒ `0600` owner-read is sufficient).

2. **Change (permissions only):**
   - `chmod 600 ~/aecloud/.env`

3. **Post-checks (prove no content change + still readable + still parses):**
   - `stat -c '%a %U:%G' ~/aecloud/.env` → expect `600 faithhosting:faithhosting`.
   - `sha256sum ~/aecloud/.env` → **must equal the pre-change checksum** (content
     identical).
   - Readability by the owner: `test -r ~/aecloud/.env && echo readable`.
   - Dotenv parse dry-run (reads + counts keys, prints NO values):
     `node -e "const r=require('dotenv').config({path:process.env.HOME+'/aecloud/.env'}); console.log(r.error?('PARSE_ERROR:'+r.error.message):('parsed '+Object.keys(r.parsed).length+' keys'))"`
     → expect `parsed N keys` (same N as before).

4. **Running process:** `chmod` does not affect the already-loaded process; no
   restart is required for it to keep running. If you want to prove the NEXT
   startup still reads the file, schedule a restart as a SEPARATE, explicitly
   approved maintenance step (not bundled here).

5. **Rollback (only if a real problem appears):** `chmod 644 ~/aecloud/.env`
   restores the prior mode; the recorded checksum proves content was never
   altered. (`0600` is strictly more restrictive and should not break an
   owner-run process, so rollback is not expected to be needed.)

## Approval gate

- It touches production, so it required **separate explicit approval** — which was
  granted on 2026-08-23 (scoped to the `chmod` correction only).

## EXECUTION RECORD (2026-08-23, approved)

Executed exactly per the 12-step procedure. Contents never displayed, edited, or
copied.

- **Target (resolved):** `/home/faithhosting/aecloud/.env` (path match confirmed).
- **Identity guard:** file owner `faithhosting:faithhosting`; AEC process runs as
  `faithhosting` → proceeded.
- **Before → after (only mode differs):**
  - mode: `644` → **`600`**
  - owner/group: `faithhosting:faithhosting` → **UNCHANGED**
  - size: `1029` → **UNCHANGED**
  - mtime epoch: `1786981493` → **UNCHANGED**
  - **SHA-256: `4ddf8b9525982cebcdcacb3178495a0c76313a676e7bf267143a41251e092410` → UNCHANGED (content identical)**
  - (`ctime` changes by design for a permission change.)
- **Owner readable after:** YES.
- **dotenv parse:** loaded **20** variable names successfully (names only, no
  values printed).
- **Production process:** SAME PID **`4019223`** (ppid 1, ~12.9-day uptime,
  started 2026-08-10) — did NOT restart; `GET /health` → `{"status":"ok"}`.
  (An initial report of a changed PID was a measurement error: `pgrep -f`
  matched the remediation command's own process; the real node process was
  stable throughout.)
- **Bindings:** `127.0.0.1:3300` loopback-only; **public `:3300` connection
  refused**; Faith Harbor OS `:3200` unchanged.
- **Scope:** only `chmod 600` + one protected metadata record file
  (`~/env-perm-remediation.<epoch>.txt`, mode `0600`, no secrets). No restart,
  deploy, reload, migrate, email, Stripe/NameSilo contact, or other file change.
- **Rollback (not needed):** `chmod 644 /home/faithhosting/aecloud/.env`; the
  identical checksum proves content was never altered.

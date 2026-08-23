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

- This plan is **not executed** and is **not** part of Stage 12A.
- It touches production, so it requires your **separate explicit approval**, ideally
  during a maintenance window, before any step 2 `chmod` runs.

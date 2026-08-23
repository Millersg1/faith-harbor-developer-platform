# Stage 12A — Local Runner (as-built) + Runbook

Option A (local development runner) is prepared. No external NameSilo/Stripe
request has been made; production is untouched. External contract testing begins
only after NameSilo sandbox credentials are placed locally and the preflight
reports `READINESS: PASS`, with your explicit go-ahead.

## As-built (local, disposable)

| Item | Value |
| --- | --- |
| Harness bind | `127.0.0.1:39117` (loopback only) |
| Disposable PostgreSQL | **separate cluster**, `127.0.0.1:5433` (loopback only) — NOT the installed 5432 service |
| PG data dir (disposable) | `C:\Users\shawn\ote-acceptance-pgdata` |
| PG log | `C:\Users\shawn\ote-acceptance-pg.log` |
| Database / role / schema | `ote_scratch` / `ote_tester` / `ote_acceptance` |
| Secrets file | `<repo>\ote-acceptance.env` — git-ignored (`.gitignore:6`), ACL restricted to the local user only (`icacls /inheritance:r`) |
| Encryption keyring | fresh **test-only** 32-byte keys (generated locally; not production) |
| DB password | fresh throwaway (in `OTE_PG_URL` inside the git-ignored env file) |
| Outbound IP (at prep time) | `174.96.238.151` — **re-confirm at whitelist time**, it can change |

Pre-credential preflight result (local wiring — no external call):
all local checks PASS (acknowledgment, encryption_keyring, disposable_pg,
port_isolation, loopback_bind, mutations_disabled); BLOCKED only on the four
provider fields still to be supplied (`stripe_secret`, `stripe_webhook_secret`,
`namesilo_endpoint`, `namesilo_ote_key`).

## To finish arming (owner, locally — never in chat)

1. Obtain the NameSilo sandbox/OTE account; confirm endpoint host `ote.namesilo.com`
   and that the current outbound IP is whitelisted (`curl -s https://api.ipify.org`
   immediately before requesting the whitelist; if it changes, stop and update the
   whitelist — do not work around it).
2. Authenticate the Stripe CLI to a **test/sandbox** account (never live):
   `stripe login`, then confirm mode is test; forward signed webhooks to the
   harness: `stripe listen --forward-to http://127.0.0.1:39117/webhooks/stripe/domains`.
3. Edit `<repo>\ote-acceptance.env` and fill the four blank fields:
   `NAMESILO_OTE_ENDPOINT`, `NAMESILO_OTE_API_KEY`,
   `STRIPE_DOMAIN_TEST_SECRET_KEY` (`sk_test_…`), `STRIPE_DOMAIN_TEST_WEBHOOK_SECRET`.
4. Run `npm run ote:preflight ./ote-acceptance.env` → require `READINESS: PASS`.
5. Use only clearly synthetic test identities — never real customer PII — in OTE /
   Stripe test objects.

## Start / stop / cleanup (PowerShell)

```powershell
$bin="C:\Program Files\PostgreSQL\17\bin"; $data="C:\Users\shawn\ote-acceptance-pgdata"
# status
& "$bin\pg_ctl.exe" -D $data status
# start (if stopped)  — loopback:5433 only
& "$bin\pg_ctl.exe" -D $data -l "C:\Users\shawn\ote-acceptance-pg.log" -o "-p 5433 -c listen_addresses=127.0.0.1" start
# stop
& "$bin\pg_ctl.exe" -D $data stop -m fast
```

Full teardown when done (removes ALL disposable local state):
```powershell
& "$bin\pg_ctl.exe" -D $data stop -m immediate
Remove-Item -Recurse -Force $data
Remove-Item -Force "C:\Users\shawn\ote-acceptance-pg.log"
Remove-Item -Force "C:\Users\shawn\faith-harbor-developer-platform\ote-acceptance.env"
```

Nothing here touches the server, production PostgreSQL/`public`, Apache, DNS,
Stripe live mode, email, or cPanel.

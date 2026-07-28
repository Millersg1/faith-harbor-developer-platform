# 10 — Deployment

The platform runs as its own Node 24 process on a cPanel host, separate from
production Faith Harbor OS.

## Environment variables (`~/aecloud/.env` on the server, never in the repo)

| Var | Purpose |
|---|---|
| PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, PG_DATABASE | Postgres (`faithhosting_aecloud`) |
| PLATFORM_PORT | HTTP port (default 3300) |
| PLATFORM_BASE_DOMAIN | e.g. `staging.allelitecloud.com` (tenant subdomains, reset links) |
| PLATFORM_SECURE_COOKIE | `true` in staging/prod (Secure cookies) |
| SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM | email (mail.allelitecloud.com:465) |
| STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET | billing |
| OPENAI_API_KEY (+ base URL) | platform AI |
| FILE_STORAGE_DIR | file bytes (default `~/aecloud/storage`) |
| DRIP_TICK_MS | drip worker interval (default 60000) |

**Always ensure a leading newline before appending** to this .env (past
corruption glued keys together).

## Server layout

```
~/aecloud/
  dist/               compiled app (deployed artifact)
  storage/            uploaded file bytes
  .env                secrets
  keepalive.sh        cron watchdog
  platform.log        stdout/stderr
```

## Deployment steps

```
# local
npm run typecheck && npm test && npm run build     # (tests run on CI; local runner may be blocked)
tar czf - dist | ssh -i ~/.ssh/faithharbor_claude -p 2222 \
  faithhosting@server.allelitehosting.com 'cd ~/aecloud && tar xzf -'
# restart
ssh … 'pkill -9 -f "dist/platform/platformServer.js"'   # SSH may drop (exit 255) — expected
ssh … 'bash ~/aecloud/keepalive.sh'                      # idempotent; starts if down
```

**Gotchas learned:**
- `pkill` in an SSH command often drops the connection (exit 255) *after*
  killing — that's fine; extract dist first, then kill.
- `keepalive.sh` is a no-op if a process is already running, so to load new
  code you must kill the old process first (or wait for cron). A raced restart
  can leave the **old code serving** — verify a new route responds after deploy.
- Verify with: `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3300/`.

## Restart / rollback

Restart: kill + `keepalive.sh`. Rollback: redeploy a previous `dist` (keep the
prior tar) and restart. No DB down-migrations yet — schema changes are additive.

## Backups

Automated. `scripts/aecloud-backup.sh` (deployed to `~/aecloud/backup.sh`) runs
daily at **03:30** via cron: `pg_dump` of the platform DB → gzip →
`~/aecloud/backups/aecloud-<ts>.sql.gz`, prunes local copies older than 14 days
(`AECLOUD_BACKUP_RETAIN_DAYS`), and best-effort mirrors off-box to Google Drive
via rclone (`gdrive:AllEliteCloud-Backups`, mirroring the legacy OS pattern).
Outcomes are logged to `~/aecloud/backups/backup.log`. Safe to run manually and
repeatedly.

**Restore:**
```
gunzip -c ~/aecloud/backups/aecloud-<ts>.sql.gz \
  | psql -h 127.0.0.1 -U <PG_USER> -d <PG_DATABASE>
```
(Restore into a fresh/empty database or a staging DB first to verify.)

**To do:** periodically test a full restore into a scratch database.

## Cron jobs / workers

- `keepalive.sh` — every minute (and `@reboot`) restarts the platform if down.
- In-process drip tick — every `DRIP_TICK_MS` (default 60s), `unref`'d.

## SSL / domains

TLS terminates at the cPanel proxy (hence `PLATFORM_SECURE_COOKIE=true`).
Tenant custom domains are verified via DNS TXT and served live by the app.

## Monitoring / recovery

Today: `platform.log` + keepalive. **Outstanding:** health checks, alerting,
structured logs. Recovery: restore latest `pg_dump`, redeploy last-good `dist`,
restart.

## CI

GitHub Actions runs `npm ci && npm run validate` (`typecheck && test &&
build`). The dev sandbox has no outbound network to `api.github.com`, so CI is
verified by pushing and viewing the Actions tab.

## Related

For migrating, cloning, or recovering client WordPress sites hosted on the
platform, see [`15_WORDPRESS_MIGRATION_SOP.md`](15_WORDPRESS_MIGRATION_SOP.md).

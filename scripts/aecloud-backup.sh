#!/bin/bash
# All Elite Cloud — database backup.
#
# Dumps the platform's Postgres database, gzips it, prunes local copies older
# than the retention window, and (best-effort) mirrors off-box to Google Drive
# via rclone (mirroring the legacy Faith Harbor OS pattern). Reads PG creds
# from ~/aecloud/.env. Intended to run daily from cron. Safe to run manually
# and more than once.
#
# Restore: gunzip -c <file>.sql.gz | psql -h <host> -U <user> -d <database>
set -uo pipefail

APP="$HOME/aecloud"
ENV="$APP/.env"
OUT="$APP/backups"
RETAIN_DAYS="${AECLOUD_BACKUP_RETAIN_DAYS:-14}"

mkdir -p "$OUT"

val() { grep -m1 "^$1=" "$ENV" 2>/dev/null | cut -d= -f2-; }

PGHOST="$(val PG_HOST)";       PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="$(val PG_PORT)";       PGPORT="${PGPORT:-5432}"
PGUSER="$(val PG_USER)"
PGDATABASE="$(val PG_DATABASE)"
export PGPASSWORD="$(val PG_PASSWORD)"

if [ -z "$PGUSER" ] || [ -z "$PGDATABASE" ]; then
  echo "$(date '+%F %T') backup FAILED: missing PG_USER/PG_DATABASE" >> "$OUT/backup.log"
  exit 1
fi

TS="$(date '+%Y%m%d-%H%M%S')"
FILE="$OUT/aecloud-$TS.sql.gz"

if pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
     --no-owner --no-privileges | gzip > "$FILE"; then
  echo "$(date '+%F %T') backup ok: $(basename "$FILE") ($(du -h "$FILE" | cut -f1))" >> "$OUT/backup.log"
else
  echo "$(date '+%F %T') backup FAILED (pg_dump)" >> "$OUT/backup.log"
  rm -f "$FILE"
  unset PGPASSWORD
  exit 1
fi

unset PGPASSWORD

# Retention: drop local dumps older than the window.
find "$OUT" -name 'aecloud-*.sql.gz' -mtime "+$RETAIN_DAYS" -delete 2>/dev/null || true

# Best-effort off-box mirror to Google Drive (same rclone the legacy OS uses).
if [ -x "$HOME/bin/rclone" ]; then
  "$HOME/bin/rclone" sync "$OUT" gdrive:AllEliteCloud-Backups >/dev/null 2>&1 || true
fi

exit 0

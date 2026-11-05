#!/bin/sh
# Backs up the database and the uploaded files into /backups.
#   sh backup.sh        run forever: back up now, then every $BACKUP_INTERVAL_HOURS hours
#   sh backup.sh once   one backup, then exit (npm run backup)
# Runs in the ease-work-backup container (docker-compose.yml).
set -eu

BACKUPS=${BACKUPS:-/backups}
UPLOADS=${UPLOADS:-/uploads}
KEEP=${BACKUP_KEEP:-28}
INTERVAL=${BACKUP_INTERVAL_HOURS:-6}

backup() {
  stamp=$(date +%Y%m%d-%H%M%S)
  # Written under a temporary name first, so a half-finished backup is never
  # mistaken for a good one. Chained with && because `set -e` is off inside `backup ||`.
  pg_dump --format=custom --file="$BACKUPS/db-$stamp.dump.partial" &&
    mv "$BACKUPS/db-$stamp.dump.partial" "$BACKUPS/db-$stamp.dump" &&
    tar -czf "$BACKUPS/uploads-$stamp.tar.gz.partial" -C "$UPLOADS" . &&
    mv "$BACKUPS/uploads-$stamp.tar.gz.partial" "$BACKUPS/uploads-$stamp.tar.gz" ||
    return 1

  # Keep the newest $KEEP of each kind.
  for kind in db uploads; do
    ls -1t "$BACKUPS"/$kind-* 2>/dev/null | grep -v '\.partial$' | tail -n +$((KEEP + 1)) | xargs -r rm -f
  done
  echo "$(date '+%F %T') backup $stamp done: database $(du -h "$BACKUPS/db-$stamp.dump" | cut -f1), files $(du -h "$BACKUPS/uploads-$stamp.tar.gz" | cut -f1)"
}

rm -f "$BACKUPS"/*.partial
until pg_isready --quiet; do sleep 2; done

if [ "${1:-}" = once ]; then
  backup
  exit 0
fi

while true; do
  backup || echo "$(date '+%F %T') BACKUP FAILED" >&2
  sleep $((INTERVAL * 3600))
done

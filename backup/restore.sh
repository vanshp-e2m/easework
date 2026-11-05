#!/bin/sh
# Restores the database and uploaded files from a backup:
#   npm run restore -- 20261105-180000          shows what will happen
#   npm run restore -- 20261105-180000 --yes    does it
# The current data is backed up first, so a restore can itself be undone.
# Stop the app (npm run dev) before restoring.
set -eu

BACKUPS=${BACKUPS:-/backups}
UPLOADS=${UPLOADS:-/uploads}
stamp=${1:-}

if [ -z "$stamp" ]; then
  echo "Usage: npm run restore -- <backup time> [--yes]"
  echo "Available backups (newest first):"
  ls -1t "$BACKUPS"/db-*.dump 2>/dev/null | sed 's|.*/db-||; s|\.dump$||' | head -20
  exit 1
fi
if [ ! -f "$BACKUPS/db-$stamp.dump" ]; then
  echo "There is no backup called $stamp. Run without a name to list them."
  exit 1
fi
if [ "${2:-}" != --yes ]; then
  echo "This replaces ALL current data in database \"$PGDATABASE\" with the backup from $stamp"
  [ -f "$BACKUPS/uploads-$stamp.tar.gz" ] && echo "and replaces the uploaded files with the ones from that backup."
  echo "A backup of the current data is taken first. To go ahead, add --yes."
  exit 1
fi

echo "Backing up the current data first..."
sh "$(dirname "$0")/backup.sh" once

echo "Restoring the database from $stamp..."
pg_restore --clean --if-exists --no-owner --single-transaction --dbname="$PGDATABASE" "$BACKUPS/db-$stamp.dump"

if [ -f "$BACKUPS/uploads-$stamp.tar.gz" ]; then
  echo "Restoring uploaded files..."
  find "$UPLOADS" -mindepth 1 -delete
  tar -xzf "$BACKUPS/uploads-$stamp.tar.gz" -C "$UPLOADS"
fi
echo "Restored $stamp. Start the app again with npm run dev."

#!/usr/bin/env bash
set -euo pipefail

# Usage: restore_postgres.sh <dump-file>
if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <dump-file>"
  exit 2
fi

DUMPFILE="$1"
if [ ! -f "$DUMPFILE" ]; then
  echo "Dump file not found: $DUMPFILE"
  exit 2
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is required in environment to restore.";
  exit 2
fi

echo "[restore] Restoring $DUMPFILE to DATABASE_URL"
pg_restore --clean --no-owner --dbname="$DATABASE_URL" "$DUMPFILE"
echo "[restore] Restore completed"

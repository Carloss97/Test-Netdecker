#!/usr/bin/env bash
set -euo pipefail

# Usage: backup_postgres.sh [outfile]
# If DATABASE_URL is set (Postgres connection string), it will be used.

OUTFILE=${1:-"backups/prod-$(date '+%Y%m%d%H%M%S').dump"}
mkdir -p "$(dirname "$OUTFILE")"

if [ -n "${DATABASE_URL:-}" ]; then
  echo "[backup] Using DATABASE_URL from environment"
  pg_dump --format=custom --file="$OUTFILE" "$DATABASE_URL"
else
  echo "ERROR: DATABASE_URL not set. Set it or pass connection details."
  exit 2
fi

echo "[backup] Postgres backup written to $OUTFILE"

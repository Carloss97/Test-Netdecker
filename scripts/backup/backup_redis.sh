#!/usr/bin/env bash
set -euo pipefail

# Usage: backup_redis.sh [out.rdb]
OUTFILE=${1:-"backups/redis-$(date '+%Y%m%d%H%M%S').rdb"}
REDIS_HOST=${REDIS_HOST:-localhost}
REDIS_PORT=${REDIS_PORT:-6379}
mkdir -p "$(dirname "$OUTFILE")"

echo "[backup] Creating Redis RDB snapshot to $OUTFILE"
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" --rdb "$OUTFILE"
echo "[backup] Redis snapshot written to $OUTFILE"

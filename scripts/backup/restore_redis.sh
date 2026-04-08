#!/usr/bin/env bash
set -euo pipefail

# Usage: restore_redis.sh /path/to/dump.rdb /path/to/redis-data-dir
# Requires access to the Redis data directory on the host (may require root).
if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <dump.rdb> <redis-data-dir>"
  exit 2
fi

DUMPFILE="$1"
DATA_DIR="$2"

if [ ! -f "$DUMPFILE" ]; then
  echo "Dump file not found: $DUMPFILE"
  exit 2
fi

if [ ! -d "$DATA_DIR" ]; then
  echo "Data dir not found: $DATA_DIR"
  exit 2
fi

echo "[restore] Stopping redis, copying RDB and restarting (requires sudo)"
sudo systemctl stop redis || true
sudo cp "$DUMPFILE" "$DATA_DIR/dump.rdb"
sudo chown redis:redis "$DATA_DIR/dump.rdb" || true
sudo systemctl start redis
echo "[restore] Redis restore attempted; verify server state"

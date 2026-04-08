#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[start-dev] Bringing up Docker services..."
docker compose up -d

echo "[start-dev] Waiting for Postgres (container 'db') to accept connections..."
RETRIES=0
MAX_RETRIES=60
until docker compose exec db pg_isready -U user -d tcg_singles_db -p 5432 > /dev/null 2>&1 || [ $RETRIES -ge $MAX_RETRIES ]; do
  printf '.'
  sleep 1
  RETRIES=$((RETRIES+1))
done
if [ $RETRIES -ge $MAX_RETRIES ]; then
  echo "\n[start-dev] Postgres did not become ready after ${MAX_RETRIES}s." >&2
  exit 1
fi
echo "\n[start-dev] Postgres is ready."

echo "[start-dev] Installing dependencies (backend/frontend)..."
npm --prefix backend ci
npm --prefix frontend ci

echo "[start-dev] Applying Prisma schema..."
npm --prefix backend run prisma:push

echo "[start-dev] Seeding database (if needed)..."
npm --prefix backend run prisma:seed || true

echo "[start-dev] Starting dev servers (this will block)..."
# Ensure backend port is free (kill any stale process listening on the backend PORT)
BACKEND_PORT=3333
if [ -f backend/.env ]; then
  # extract PORT value if present
  PVAL=$(grep -E '^PORT=' backend/.env | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
  if [ -n "$PVAL" ]; then
    BACKEND_PORT="$PVAL"
  fi
fi

echo "[start-dev] Checking backend port ${BACKEND_PORT} for conflicts..."
PID_TO_KILL=$(ss -ltnp 2>/dev/null | awk -v p=":${BACKEND_PORT}" '$4 ~ p { match($0, /pid=([0-9]+)/, a); if(a[1]) print a[1] }' | head -n1 || true)
if [ -n "$PID_TO_KILL" ]; then
  echo "[start-dev] Found process $PID_TO_KILL listening on port ${BACKEND_PORT}, attempting to kill..."
  kill "$PID_TO_KILL" 2>/dev/null || kill -9 "$PID_TO_KILL" 2>/dev/null || true
  sleep 1
fi

echo "[start-dev] Launching dev servers..."
# Kill leftover dev processes (concurrently/vite/tsx) from previous runs to avoid duplicates
echo "[start-dev] Cleaning up previous dev processes (if any)..."
PIDS_TO_KILL=$(pgrep -f "/workspaces/Test-Netdecker/node_modules/.bin/concurrently" || true)
if [ -n "$PIDS_TO_KILL" ]; then
  echo "[start-dev] Killing old concurrently PIDs: $PIDS_TO_KILL"
  kill $PIDS_TO_KILL 2>/dev/null || kill -9 $PIDS_TO_KILL 2>/dev/null || true
fi
PIDS_TO_KILL=$(pgrep -f "/workspaces/Test-Netdecker/backend/node_modules/.bin/tsx" || true)
if [ -n "$PIDS_TO_KILL" ]; then
  echo "[start-dev] Killing old backend tsx PIDs: $PIDS_TO_KILL"
  kill $PIDS_TO_KILL 2>/dev/null || kill -9 $PIDS_TO_KILL 2>/dev/null || true
fi
PIDS_TO_KILL=$(pgrep -f "/workspaces/Test-Netdecker/frontend/node_modules/.bin/vite" || true)
if [ -n "$PIDS_TO_KILL" ]; then
  echo "[start-dev] Killing old frontend vite PIDs: $PIDS_TO_KILL"
  kill $PIDS_TO_KILL 2>/dev/null || kill -9 $PIDS_TO_KILL 2>/dev/null || true
fi

sleep 1

npm run dev

#!/usr/bin/env bash
set -euo pipefail

# Minimal staging server bootstrap helper.
# Usage (on the staging server):
#   sudo bash init_staging_server.sh <deploy-user>
# This will install Docker if missing and create a placeholder `/home/<deploy-user>/staging.env`.

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <deploy-user>"
  exit 2
fi

DEPLOY_USER="$1"
USER_HOME=$(eval echo "~${DEPLOY_USER}")
STAGING_ENV_PATH="$USER_HOME/staging.env"

echo "[staging-init] Running as: $(id -un)"
echo "[staging-init] Target deploy user: $DEPLOY_USER (home: $USER_HOME)"

# Ensure Docker is installed (works on Ubuntu/Debian). Use the official convenience script for simplicity.
if ! command -v docker >/dev/null 2>&1; then
  echo "[staging-init] Docker not found — installing via get.docker.com script (requires network access)"
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sh /tmp/get-docker.sh
  rm -f /tmp/get-docker.sh
else
  echo "[staging-init] Docker already installed"
fi

# Ensure deploy user can run docker without sudo
if id -nG "$DEPLOY_USER" | grep -qw docker; then
  echo "[staging-init] $DEPLOY_USER is already in docker group"
else
  echo "[staging-init] Adding $DEPLOY_USER to docker group (you may need to re-login for group change to apply)"
  usermod -aG docker "$DEPLOY_USER" || true
fi

# Create a safe placeholder staging.env if it doesn't exist
if [ ! -f "$STAGING_ENV_PATH" ]; then
  echo "[staging-init] Creating placeholder $STAGING_ENV_PATH"
  cat > "$STAGING_ENV_PATH" <<'EOF'
# Copy values from backend/staging.env.example and populate with real secrets.
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tcg_singles_db"
REDIS_URL="redis://localhost:6379"
PORT=3333
NODE_ENV=production
EOF
  chown "$DEPLOY_USER":"$DEPLOY_USER" "$STAGING_ENV_PATH" || true
  chmod 600 "$STAGING_ENV_PATH"
else
  echo "[staging-init] $STAGING_ENV_PATH already exists — not overwriting"
fi

echo "[staging-init] Bootstrap complete. Next steps (on your local machine):"
echo "  1) scp backend/staging.env.example ${DEPLOY_USER}@<HOST>:/home/${DEPLOY_USER}/staging.env"
echo "  2) Trigger deploy workflow in GitHub Actions or run the container on the server:"
echo "     docker pull ghcr.io/<YOUR_GHCR_OWNER>/test-netdecker-backend:staging-latest && docker run -d --name tcg-backend --env-file /home/${DEPLOY_USER}/staging.env -p 3333:3333 ghcr.io/<YOUR_GHCR_OWNER>/test-netdecker-backend:staging-latest"

#!/usr/bin/env bash
set -euo pipefail

# Example helper to set repository secrets using the `gh` CLI.
# Usage: run locally from the repo root after `gh auth login`.

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI not found. Install from https://cli.github.com/"
  exit 2
fi

echo "Setting repository secrets (interactive). Ensure GH CLI is authenticated."

read -p "GHCR_PAT (will be hidden): " -r -s GHCR_PAT
echo
gh secret set GHCR_PAT --body "$GHCR_PAT"

read -p "STAGING_SSH_HOST: " STAGING_SSH_HOST
gh secret set STAGING_SSH_HOST --body "$STAGING_SSH_HOST"

read -p "STAGING_SSH_USER: " STAGING_SSH_USER
gh secret set STAGING_SSH_USER --body "$STAGING_SSH_USER"

echo "Paste contents of SSH private key (PEM), then Ctrl-D:" && cat | gh secret set STAGING_SSH_KEY --body -

read -p "STAGING_SSH_PORT (default 22): " STAGING_SSH_PORT
STAGING_SSH_PORT=${STAGING_SSH_PORT:-22}
gh secret set STAGING_SSH_PORT --body "$STAGING_SSH_PORT"

echo "Secrets set. You can now run the `Build and Push Docker images to GHCR` workflow in Actions."

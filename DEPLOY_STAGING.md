# Staging deployment guide

This document describes a simple staging deployment using GHCR and a small VPS (SSH + Docker).

Prerequisites (staging server):
- Docker installed and running
- A file `/home/<user>/staging.env` with the necessary env vars (e.g. `DATABASE_URL`, `REDIS_URL`, `NODE_ENV=production`, etc.)

Server bootstrap helper:
- A helper script is included at `scripts/staging/init_staging_server.sh`. Upload it to the staging host and run:

```sh
sudo bash init_staging_server.sh <deploy-user>
```

This will install Docker (if missing) and create a safe placeholder `/home/<deploy-user>/staging.env`. After that, copy a populated `backend/staging.env.example` to the server and edit it with real secrets.

GitHub Secrets to add to the repository (`Settings → Secrets`):
- `GHCR_PAT` — Personal Access Token with `write:packages` scope (used to push images to ghcr.io)
- `STAGING_SSH_HOST` — staging server host (IP or domain)
- `STAGING_SSH_USER` — SSH user (e.g. `ubuntu`)
- `STAGING_SSH_KEY` — SSH private key for `STAGING_SSH_USER`
- `STAGING_SSH_PORT` — optional SSH port (defaults to 22)

Also ensure the `STAGING_SSH_USER` has a writable home directory and that `/home/<user>/staging.env` contains the runtime env variables for the backend.

Workflows included:
- `.github/workflows/build-and-push-ghcr.yml` — builds the backend Docker image and pushes to GHCR (`staging-latest` and commit SHA tags).
- `.github/workflows/deploy-to-staging.yml` — deploys an image from GHCR to the staging server via SSH. Use the `workflow_dispatch` UI and set `image_tag` if needed.

Usage example (manual flow):
1. Trigger `Build and Push Docker images to GHCR` from Actions or push to `main`.
2. After the image is available, trigger `Deploy to Staging` and set `image_tag=staging-latest` (or the commit SHA tag).

Quick manual copy example (from your machine):

```sh
# Copy example env and edit on the staging host
scp backend/staging.env.example ${STAGING_SSH_USER}@${STAGING_SSH_HOST}:/home/${STAGING_SSH_USER}/staging.env
ssh ${STAGING_SSH_USER}@${STAGING_SSH_HOST} 'nano /home/${STAGING_SSH_USER}/staging.env'

# Trigger the GH Actions Deploy to Staging workflow, or SSH and run the pull/run commands manually:
ssh ${STAGING_SSH_USER}@${STAGING_SSH_HOST} \
	'docker pull ghcr.io/<YOUR_GHCR_OWNER>/test-netdecker-backend:staging-latest && docker stop tcg-backend || true && docker rm tcg-backend || true && docker run -d --name tcg-backend --env-file /home/${STAGING_SSH_USER}/staging.env -p 3333:3333 ghcr.io/<YOUR_GHCR_OWNER>/test-netdecker-backend:staging-latest'
```

Notes:
- This is a minimal opinionated flow for quick staging. For production, consider an orchestrator (Kubernetes), secret management, health checks, and zero-downtime deployments.

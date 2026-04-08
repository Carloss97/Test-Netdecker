# Staging deployment guide

This document describes a simple staging deployment using GHCR and a small VPS (SSH + Docker).

Prerequisites (staging server):
- Docker installed and running
- A file `/home/<user>/staging.env` with the necessary env vars (e.g. `DATABASE_URL`, `REDIS_URL`, `NODE_ENV=production`, etc.)

GitHub Secrets to add to the repository (`Settings → Secrets`):
- `GHCR_PAT` — Personal Access Token with `write:packages` scope (used to push images to ghcr.io)
- `STAGING_SSH_HOST` — staging server host (IP or domain)
- `STAGING_SSH_USER` — SSH user (e.g. `ubuntu`)
- `STAGING_SSH_KEY` — SSH private key for `STAGING_SSH_USER`
- `STAGING_SSH_PORT` — optional SSH port (defaults to 22)

Workflows included:
- `.github/workflows/build-and-push-ghcr.yml` — builds the backend Docker image and pushes to GHCR (`staging-latest` and commit SHA tags).
- `.github/workflows/deploy-to-staging.yml` — deploys an image from GHCR to the staging server via SSH. Use the `workflow_dispatch` UI and set `image_tag` if needed.

Usage example (manual flow):
1. Trigger `Build and Push Docker images to GHCR` from Actions or push to `main`.
2. After the image is available, trigger `Deploy to Staging` and set `image_tag=staging-latest` (or the commit SHA tag).

Notes:
- This is a minimal opinionated flow for quick staging. For production, consider an orchestrator (Kubernetes), secret management, health checks, and zero-downtime deployments.

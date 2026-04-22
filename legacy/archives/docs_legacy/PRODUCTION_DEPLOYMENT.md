# Production deployment plan

This document outlines a pragmatic, minimal-cost production deployment for the backend service. It focuses on safety (backups, migration strategy), predictable CI/CD, and observability.

Goals
- Deploy the backend container image (GHCR) to a small VPS or managed host.
- Use managed Postgres and Redis (recommended) or dedicated VMs with backups/snapshots.
- Ensure zero-surprise deployments: backup → migrate → deploy → smoke checks.

Recommended architecture
- App: single container running the backend image (Docker) behind a reverse proxy (Nginx) with TLS.
- DB: Managed Postgres (e.g. DigitalOcean Managed, RDS) with daily snapshots and PITR if available.
- Cache: Managed Redis or single-node Redis with periodic RDB/AOF backups.
- Registry: GHCR (GitHub Container Registry) for images.
- Secrets: GitHub Actions Secrets or Vault for secrets injection.

Required repository secrets (minimum)
- `GHCR_PAT` — push images to GHCR (already documented).
- `PROD_SSH_HOST`, `PROD_SSH_USER`, `PROD_SSH_KEY`, `PROD_SSH_PORT` — SSH deploy to production host.
- `PROD_ENV_PATH` — path to the env file on the host (default: `/home/<user>/prod.env`).

CI/CD (high-level)
1. Build image and push to GHCR (tag: `staging-latest` and commit SHA). Use `build-and-push-ghcr.yml`.
2. Optionally run integration/e2e tests against a staging environment.
3. When ready, trigger `production-deploy.yml` (manual `workflow_dispatch`) which:
   - Ensures a DB backup is taken on the production host.
   - Pulls the selected GHCR image on the host.
   - Runs `prisma migrate deploy` (or runs migrations inside the container) after the backup.
   - Starts the new container and performs smoke checks.

Deployment steps (manual)
1. Ensure the production host has Docker installed and a `prod.env` file with properly set secrets (use the `scripts/staging/init_staging_server.sh` helper as a basis).
2. Trigger the `Build and Push Docker images to GHCR` workflow or ensure the desired image tag exists on GHCR.
3. Trigger `production-deploy.yml` (Actions → workflow → Run workflow) and set `image_tag` to the commit SHA or `staging-latest`.

Rollback strategy
- Keep the previous image tag available on GHCR. If a deploy fails, SSH into the host and run the previous image:

  docker pull ghcr.io/<OWNER>/test-netdecker-backend:<previous-tag>
  docker stop tcg-backend || true
  docker rm tcg-backend || true
  docker run -d --name tcg-backend --env-file /home/<user>/prod.env -p 3333:3333 ghcr.io/<OWNER>/test-netdecker-backend:<previous-tag>

Security notes
- DO NOT store admin credentials in plaintext in the repo. Use GitHub Secrets, env files on the host with restricted permissions, or Vault.
- Use TLS for external traffic (Nginx + Let's Encrypt recommended).

Monitoring & health
- Expose a health endpoint and Docker healthcheck. Integrate Sentry and Prometheus for error/metrics collection (see `OBSERVABILITY.md`).

Next improvements (post-launch)
- Add a CI job that runs the full test suite against a disposable staging environment.
- Add blue/green or canary deploy support.
- Implement a secure secret injection workflow (HashiCorp Vault or GitHub Actions OIDC + Secrets Manager).

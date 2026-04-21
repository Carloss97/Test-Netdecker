# GitHub Secrets setup (quick guide)

This file describes the minimum repository secrets needed for the CI and staging workflows in this repo.

Required secrets
- `GHCR_PAT` — Personal Access Token for GitHub Packages (scope: `write:packages`). Used by the `build-and-push` workflow to push Docker images to `ghcr.io`.
- `STAGING_SSH_HOST` — staging server host (IP or domain).
- `STAGING_SSH_USER` — SSH user on the staging host (e.g. `ubuntu`).
- `STAGING_SSH_KEY` — the SSH private key content for `STAGING_SSH_USER` (paste as single-line here).
- `STAGING_SSH_PORT` — optional SSH port (defaults to `22`).

Production secrets (recommended)
- `PROD_SSH_HOST` — production host (IP or domain)
- `PROD_SSH_USER` — production SSH user (e.g. `ubuntu`)
- `PROD_SSH_KEY` — production SSH private key (paste as secret)
- `PROD_SSH_PORT` — optional SSH port (defaults to 22)
- `PROD_ENV_PATH` — path to production env file on the host (e.g. `/home/ubuntu/prod.env`)

Note: use least-privilege tokens and rotate keys regularly.

Set secrets via GitHub UI
1. Go to `Settings -> Secrets and variables -> Actions` in the repository.
2. Click `New repository secret` and add each secret with the names above.

Set secrets via `gh` CLI (example)
1. Authenticate: `gh auth login`
2. Export the secret locally then run:

```sh
export GHCR_PAT="<your-personal-access-token>"
gh secret set GHCR_PAT --body "$GHCR_PAT"

gh secret set STAGING_SSH_HOST --body "your.staging.host"
gh secret set STAGING_SSH_USER --body "ubuntu"
gh secret set STAGING_SSH_KEY --body "$(cat ~/.ssh/id_rsa)"
gh secret set STAGING_SSH_PORT --body "22"
```

Notes
- `GHCR_PAT` must have `write:packages` permission at minimum. Creating a PAT scoped to packages only is recommended for least privilege.
- Never commit private keys or secrets into the repo. Use `gh secret set` or the GitHub UI.
- After adding secrets, trigger the `Build and Push Docker images to GHCR` workflow (`Actions` tab) to run the build.

Pages & runtime secrets
- `PAGES_URL` — Public Pages URL for the deployment (e.g. `https://tcg-erp.pages.dev`). Used by scheduled GitHub Actions that call Pages Functions.
- `ADMIN_MIGRATE_TOKEN` — Optional token for `x-admin-token` header used by `/api/admin/migrate` to protect remote migrations.

Set them via the UI or `gh` CLI, for example:

```sh
gh secret set PAGES_URL --body "https://tcg-erp.pages.dev"
gh secret set ADMIN_MIGRATE_TOKEN --body "$(openssl rand -hex 16)"
```

Once `PAGES_URL` is configured, scheduled workflows like `.github/workflows/cron-exchange-rate.yml` and `.github/workflows/cron-price-sync.yml` will be able to reach your Pages Functions.

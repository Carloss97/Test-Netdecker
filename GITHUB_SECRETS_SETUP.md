# GitHub Secrets setup (quick guide)

This file describes the minimum repository secrets needed for the CI and staging workflows in this repo.

Required secrets
- `GHCR_PAT` — Personal Access Token for GitHub Packages (scope: `write:packages`). Used by the `build-and-push` workflow to push Docker images to `ghcr.io`.
- `STAGING_SSH_HOST` — staging server host (IP or domain).
- `STAGING_SSH_USER` — SSH user on the staging host (e.g. `ubuntu`).
- `STAGING_SSH_KEY` — the SSH private key content for `STAGING_SSH_USER` (paste as single-line here).
- `STAGING_SSH_PORT` — optional SSH port (defaults to `22`).

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

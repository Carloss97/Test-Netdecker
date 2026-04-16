Deploying to Cloudflare Pages (tcg-erp)

Quick summary

- Use `npx wrangler pages deploy frontend/dist --project-name tcg-erp --branch main` to deploy the built `frontend/dist` folder.
- Wrangler needs a user API token (not the project "build token") with Pages permissions.

Token formatting / security note

- Do NOT include the literal prefix `Bearer ` when setting `CLOUDFLARE_API_TOKEN` — the value must be the token string only. Trim whitespace/newlines when copying.
- If you accidentally exposed a token (printed it in a terminal), revoke it immediately via Dashboard → Profile → API Tokens.


Create a usable API token

1. Go to Cloudflare Dashboard → Profile → API Tokens → Create Token.
2. Either use the "Edit Cloudflare Pages" template or create a custom token with these minimum permissions:
   - Account (Select specific account): `Pages` → `Edit`
   - (Optional) Account: `Read` — helpful for some wrangler operations
3. Record the token securely.

Local deploy (temporary env var)

PowerShell:

```powershell
$env:CLOUDFLARE_API_TOKEN = "<YOUR_TOKEN_HERE>"
npm run deploy:pages
```

Bash/macOS:

```bash
export CLOUDFLARE_API_TOKEN="<YOUR_TOKEN_HERE>"
npm run deploy:pages
```

CI / GitHub Actions

- Add a repository secret named `CLOUDFLARE_API_TOKEN` (or use your CI provider secrets) and reference it in the workflow.
- Use the same `npm run deploy:pages` step or call `npx wrangler pages deploy frontend/dist --project-name tcg-erp --branch main` directly in the job.

Useful wrangler checks

- Verify the token/account the CLI sees:

```bash
npx wrangler whoami
```

- List Pages projects accessible with the token:

```bash
npx wrangler pages project list
```

Notes on common errors

- Authentication error [code: 10000]: token lacks required Pages permissions or belongs to a different account. Recreate a token with `Pages: Edit` for the account that owns the project.
- Project not found [code: 8000007]: the project name passed to wrangler does not match any project in the account. Confirm exact project name from the Dashboard or use `npx wrangler pages project list` to see available projects.
- `Unknown arguments: get`: some older/newer wrangler versions do not include `pages project get`; use `pages project list` to inspect projects.
- Windows libuv assertion ("UV_HANDLE_CLOSING"): rare CLI/Node issue. Try `npx wrangler pages project list` again, or run `npx --package wrangler@4.83.0 wrangler pages project list` to force a clean installer. If it persists, restart your shell or try with Node LTS (recommended).

If you want, I can also:
- Add a GitHub Actions workflow that runs the build and deploys to Pages using a repo secret.
- Create a small verification step that runs `npx wrangler pages project list` during CI to validate the token before attempting deploy.

If you want that workflow, tell me and I will add it (I can create a `/.github/workflows/deploy-pages.yml`).

CI / GitHub Actions (recommended)

- A workflow is included at `.github/workflows/deploy-pages.yml` that builds `frontend` and runs a token validation step before deploying with `wrangler pages deploy`.
- Make sure to add a repository secret named `CLOUDFLARE_API_TOKEN` (Settings → Secrets) containing a user API token with `Pages: Edit` for the account that owns the Pages project.
- You can verify the token and visible projects locally with:

PowerShell:

```powershell
$env:CLOUDFLARE_API_TOKEN = "<NEW_TOKEN>"
node scripts/check-pages-project.js 61550294a6458f12ff284ade94ed0411
```

Bash:

```bash
export CLOUDFLARE_API_TOKEN="<NEW_TOKEN>"
node scripts/check-pages-project.js 61550294a6458f12ff284ade94ed0411
```

Or use the npm helper:

```bash
npm run verify:pages -- 61550294a6458f12ff284ade94ed0411
```

If the script prints projects, ensure the `slug` shown matches the `--project-name` value you use when calling `wrangler pages deploy` (the default in this repo is `tcg-erp`).

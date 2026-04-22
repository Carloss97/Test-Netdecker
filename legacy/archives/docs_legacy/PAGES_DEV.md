Cloudflare Pages + D1 — Local development and deployment
=================================

This project is configured to run on Cloudflare Pages with Pages Functions and a D1 database.

Quick summary
- Frontend static site: `frontend/` (build output: `frontend/dist`)
- Pages Functions: `functions/` (serverless endpoints under `/api/...`)
- D1 database binding expected: `TCG_D1` (name set in `wrangler.jsonc`)

Prerequisites
- Node.js 18+ and npm
- `wrangler` CLI v4 (you can use `npx --yes wrangler@4` if not installed globally)
- A Cloudflare account with a Pages project and a D1 database (recommended name: `tcg-erp-db`)
- A GitHub repo secret `CLOUDFLARE_API_TOKEN` (see Deploy section)

Local development (fast check)
1. Install deps and build the frontend:

```bash
npm ci
npm --prefix frontend install
npm --prefix frontend run build
```

2. Verify Pages project access (optional):

```bash
# Requires a valid Cloudflare API token in CLOUDFLARE_API_TOKEN
npx --yes wrangler@4 whoami
npx --yes wrangler@4 pages project list
```

3. Start a local Pages dev server (serves `frontend/dist` and Functions):

```bash
# from repo root - this will pick configuration from wrangler.jsonc
npx --yes wrangler@4 pages dev frontend --project-name tcg-erp --port 8787
```

Notes about D1 during local dev
- The Pages dev server can surface the D1 binding if your Cloudflare account has the D1 database and your API token has proper scopes. If the binding is unavailable locally the Functions will return a clear error (`No DB binding available`).
- Recommended: create the D1 database in the Cloudflare dashboard (Database name `tcg-erp-db`) and ensure `wrangler.jsonc` includes it (this repo already has a `d1_databases` entry with binding `TCG_D1`).

Smoke test
- This repo includes a lightweight smoke test: `scripts/pages-smoke-test.js`.
- Run it against a running Pages dev server with:

```bash
# adjust URL if you run dev server on a different port/host
PAGES_DEV_URL=http://127.0.0.1:8787 npm run test:pages-smoke
```

Deploy to Cloudflare Pages (CI)
- This repository already contains a GitHub Actions workflow that builds the frontend and deploys to Pages on push to `main`: see `.github/workflows/deploy-pages.yml`.
- To enable it you must add a repository secret named `CLOUDFLARE_API_TOKEN` with a token that has access to Pages and D1 (or an API token with sufficiently broad scopes). Once the secret is set you can either push to `main` or trigger the workflow manually from the Actions tab.

Manual deploy (CLI)
- If you prefer to deploy from your machine, after building run:

```bash
# requires CLOUDFLARE_API_TOKEN env var set locally
npx --yes wrangler@4 pages deploy frontend/dist --project-name tcg-erp --branch main
```

Troubleshooting
- If Pages returns HTML for API requests, confirm `apiClient` base URL is `/.netlify/functions` or `/api` and that `wrangler pages dev` is running from repository root so Functions are mounted.
- If functions say `No DB binding available`, create and bind the D1 database `tcg-erp-db` in the Cloudflare dashboard and ensure your Pages project uses the `TCG_D1` binding.

Need help?
- Tell me if you want me to: (A) run `wrangler pages dev` here (requires auth), (B) trigger a GitHub Action deploy (requires repo secrets / permissions), or (C) produce a minimal post-merge checklist for production.

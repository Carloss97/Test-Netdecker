# PR Review Checklist — feat/sqlite-fixtures-tests

Resumen rápido:
- Branch: `feat/sqlite-fixtures-tests`
- PR: feat: SQLite fallback, fixtures, and TypeScript fixes

Archivos clave a revisar:
- `backend/src/utils/db.ts` — runtime Prisma client selection (Postgres vs SQLite)
- `backend/prisma/schema.sqlite.prisma` — SQLite schema + generator
- `backend/src/tests/fixture-server.ts` — local fixture server for external API tests
- `.github/workflows/fast-sqlite-tests.yml` — PR fast test job (SQLite + fixtures)
- `.github/workflows/build-and-push-ghcr.yml` — GHCR build workflow
- `.github/workflows/deploy-after-build.yml` — staging deploy after build
- `DEPLOY_STAGING.md`, `PRODUCTION_DEPLOYMENT.md`, `MIGRATIONS.md` — deployment and migration docs
- `scripts/staging/init_staging_server.sh` and `backend/staging.env.example` — staging helpers
- `scripts/backup/*` — backup/restore helpers

What to test locally (commands):

1. Install backend deps:

```sh
npm --prefix backend ci
```

2. Generate SQLite client and push schema (creates `dev.sqlite`):

```sh
npm --prefix backend run prisma:generate:sqlite
DATABASE_URL=file:./dev.sqlite npm --prefix backend run prisma:push:sqlite
```

3. Run type-check:

```sh
npm --prefix backend run type-check
```

4. Run fast tests with fixtures (recommended for PR validation):

```sh
# Run fast tests that skip slow external suites, and use fixtures
FAST_TEST=true USE_FIXTURES=true npm --prefix backend run test
```

Or run the SQLite-focused test script:

```sh
npm --prefix backend run test:sqlite
```

5. Run the backend locally (dev):

```sh
cp backend/.env.example backend/.env
# edit backend/.env as needed, then:
npm --prefix backend run dev
```

Validation checklist for reviewers:
- [ ] `noImplicitAny` is enabled and `tsc --noEmit` passes.
- [ ] `db.ts` correctly selects SQLite when `USE_SQLITE=true` or `DATABASE_URL` starts with `file:` and falls back to Postgres otherwise.
- [ ] Fixture server provides deterministic responses for Scryfall/Pokemon/TCG endpoints and tests consume it under `USE_FIXTURES=true`.
- [ ] External base URLs are configurable via env vars in `CardDatabaseService` and tests can override them.
- [ ] CI workflows: fast-sqlite-tests runs for PRs; build-and-push-ghcr and production workflows are correct (note: GHCR push requires `GHCR_PAT` secret).
- [ ] Staging/prod docs and scripts (`DEPLOY_STAGING.md`, `PRODUCTION_DEPLOYMENT.md`, `scripts/staging/init_staging_server.sh`) are sensible and safe for your infra.
- [ ] Backup/restore scripts are acceptable for your environment and have the right permissions before running in production.

Notes about running the GHCR build here:
- I attempted to trigger the `build-and-push-ghcr.yml` workflow programmatically, but GitHub requires the workflow file to exist on the repository default branch (`main`) for `gh workflow run` to reference it by filename. Since the workflow is in this feature branch, `gh workflow run` returned 404. Options:
  - Merge the PR into `main` (CI will run automatically). 
  - Add `GHCR_PAT` secret to repository and trigger the `Build and Push Docker images to GHCR` workflow from the Actions UI after merging or by adding the workflow to `main`.
  - Alternatively, build the Docker image locally and push to GHCR manually (requires your GHCR credentials).

If you want, I can add this checklist to the PR description (edit the PR body) instead of adding this file — tell me which you prefer. Otherwise this file is in the branch and visible in the PR.

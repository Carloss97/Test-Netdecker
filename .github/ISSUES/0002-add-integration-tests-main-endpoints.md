# Add integration tests for main endpoints

Description

Implement integration tests for primary API flows (catalog, listings, inventory import, checkout) to catch regressions across layers.

Acceptance criteria

- Integration tests covering listing retrieval, import dry-run, and checkout flow.
- Tests runnable via `cd backend && npm run test` (tsx --test integration pattern).
- CI job added to run integration tests on PRs.

Reference

Source: BACKLOG.md — "Pruebas de integración para endpoints principales".
## Unreleased

### Added
- feat(stores): add per-store `currency`, `taxRate`, and `settings` (refs #37) — backend API, admin UI, validation, unit tests, Playwright E2E smoke.
- fix(inventory): atomic inventory decrement with SQLite fallback to avoid race conditions (refs #36)

### Changed
- Update TypeScript types, lint fixes, and test configuration.

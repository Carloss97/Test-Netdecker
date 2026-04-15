# Configurable partial rollback for inventory imports

## Overview

Support configurable partial rollback for inventory imports so operators can revert only affected rows when an import fails. This document outlines the proposed strategies, DB modeling, API surface, and testing guidance.

## Rollback strategies

- Full: revert the entire import run (all rows) on failure.
- Partial by batch: imports are applied in logical batches; revert only failed batch(es) or selected batches.
- None: no automatic rollback; operator will handle corrections manually.

## Data model (proposed)

- `ImportRun` (new): metadata for each import (uploader, file, startedAt, finishedAt, rollbackStrategy, status).
- `ImportBatch` (new): optional grouping within an `ImportRun` (batchIndex, rowRange, status).
- `ImportRowChange` (new): one record per affected row with before/after values, `batchId`, and a pointer to the affected domain object (e.g., `listingId` or `stockDelta`).

This model enables selective rollback by batch or by row.

## API / Service changes

- `POST /api/imports` accepts `rollbackStrategy: 'full'|'partial'|'none'` and optional `batchSize`.
- `POST /api/imports/:id/rollback` with optional `batchId` to rollback a specific batch or `?mode=all` to rollback entire run.
- Service-level: `ImportService.applyImport()` should create `ImportRun`, `ImportBatch` and `ImportRowChange` entries inside a transaction and allow safe rollback operations.

Example: rollback endpoint

POST /api/inventory/imports/:id/rollback

Body (JSON):
{
	"dryRun": true,         // optional - preview only
	"force": false,         // optional - delete created listings when true
	"batchId": "<batch-id>", // optional - target a specific batch
	"batchIndex": 1,        // optional - alternative to batchId
	"onlyListingIds": ["L1","L2"] // optional - filter which listings to revert
}

Notes:
- The API requires the `x-api-key` header when `IMPORT_API_KEY` is set in the server environment.
- The endpoint returns `{ success: true, result }` where `result` is either a preview ({ reverted, skipped, preview }) for `dryRun` or `{ reverted, skipped }` after execution.

## Concurrency & safety

- Use DB transactions where possible and application-level locks (advisory locks or row-level locks) when performing rollbacks to avoid race conditions.
- Tests should simulate concurrent checkouts/imports to verify safe behavior.

## UI considerations

- During import review show `Rollback strategy` selector and batch preview with a `Rollback` action in import history.

## Tests

- Unit tests for `ImportService` rollback logic covering full/partial/none.
- Integration tests that run imports with `SKIP_DB_INIT=true` stub and verify rollback restores previous state.

## Acceptance criteria mapping

- Backend: implemented rollback strategies (full/partial/none) and API endpoints.
- Frontend: export rollback options in import review and history (can be implemented as a follow-up PR).
- Tests: unit and integration tests covering rollback behavior and concurrency.

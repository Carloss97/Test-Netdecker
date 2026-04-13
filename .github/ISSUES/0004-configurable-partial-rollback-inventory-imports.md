# Configurable partial rollback for inventory imports

Description

Support configurable partial rollback for inventory imports so operators can revert only affected rows when an import fails.

Acceptance criteria

- Implement rollback strategy selectable per import (full, partial by batch, none).
- UI exposes rollback options during import review and in import history.
- Tests for rollback behavior and safe concurrency.

Reference

Source: BACKLOG.md — "Rollback configurable para importaciones parciales".
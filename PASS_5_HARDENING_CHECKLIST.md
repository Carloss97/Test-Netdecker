# Pass 5 Hardening Checklist

## Sprint 1: Store Scoping

### #P5-001 StoreId enforcement
- [ ] Identify all store-scoped entities and service methods.
- [ ] Remove or guard any read/write paths that can run without store context.
- [ ] Document any required migration/backfill for legacy records.
- [ ] Add tests for store-isolated reads and writes.

### #P5-002 RBAC baseline
- [ ] Define action-level permissions for ADMIN, MANAGER, and STAFF.
- [ ] Add authorization guards to sensitive backend routes.
- [ ] Ensure forbidden UI actions do not appear in the frontend.
- [ ] Add tests for allowed and denied role paths.

## Sprint 2: Concurrency and Stock

### #P5-003 Stock safety under contention
- [ ] Locate reservation, checkout, and inventory mutation hot paths.
- [ ] Add optimistic locking or another safe concurrency guard.
- [ ] Verify stock changes remain deterministic under concurrent access.
- [ ] Add regression tests for oversell-prone paths.

## Sprint 3: Audit and Validation

### #P5-004 Audit hardening
- [ ] Improve audit records for critical mutations.
- [ ] Attach the acting admin where the data model allows it.
- [ ] Keep audit output useful for support and incident review.

### #P5-005 Validation and error hygiene
- [ ] Review validation on all newly touched endpoints.
- [ ] Normalize error payloads so internal details stay hidden.
- [ ] Add tests for invalid input and error formatting.

## Validation Plan

1. Run backend type-check after each sprint-sized batch.
2. Run the targeted backend tests for the touched services/routes.
3. Manually verify the admin and inventory flows that depend on the changed authorization and stock logic.

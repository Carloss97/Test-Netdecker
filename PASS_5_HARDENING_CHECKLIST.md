# Pass 5 Hardening Checklist

Active incident remediation:
- PASS_5_MULTI_TENANT_STABILIZATION_PLAN.md (persistent multi-tenant and RBAC visibility issues across Inventory/Pricing/Low Stock/Storefront).

## Sprint 1: Store Scoping

### #P5-001 StoreId enforcement
- [x] Identify all store-scoped entities and service methods.
- [x] Remove or guard any read/write paths that can run without store context.
- [x] Document any required migration/backfill for legacy records.
- [x] Add tests for store-isolated reads and writes.

### #P5-002 RBAC baseline
- [x] Define action-level permissions for ADMIN, MANAGER, and STAFF.
- [x] Add authorization guards to sensitive backend routes.
- [x] Ensure forbidden UI actions do not appear in the frontend.
- [x] Add tests for allowed and denied role paths.

Sprint 1 evidence:
- See PASS_5_SPRINT1_STORE_SCOPING_NOTES.md for entity inventory, guard status, and legacy backfill plan.
- Key tests: backend/src/routes/listing.routes.test.ts, backend/src/middleware/tenantResolver.test.ts, backend/src/middleware/requirePermission.test.ts, backend/src/routes/admin.routes.test.ts.
- Additional Phase B evidence: backend/src/routes/admin.routes.ts now enforces global-admin-only access for `/api/admin/pricing-config` and `/api/admin/catalog/reset`.
- Additional deny-path tests: backend/src/routes/admin.routes.test.ts includes non-global and scoped-session denials for global operations.

## Sprint 2: Concurrency and Stock

### #P5-003 Stock safety under contention
- [ ] Locate reservation, checkout, and inventory mutation hot paths.
- [ ] Add optimistic locking or another safe concurrency guard.
- [ ] Verify stock changes remain deterministic under concurrent access.
- [ ] Add regression tests for oversell-prone paths.

## Sprint 3: Audit and Validation

### #P5-004 Audit hardening
- [x] Improve audit records for critical mutations.
- [ ] Attach the acting admin where the data model allows it.
- [ ] Keep audit output useful for support and incident review.

Phase C starter evidence:
- `backend/src/middleware/adminAudit.ts` now records role, sessionStoreId, resolvedStoreId, and requestPath in audit payload data.
- `backend/src/routes/admin.routes.test.ts` expanded with explicit deny-path regressions for global-only endpoints.
- `backend/src/routes/admin.routes.test.ts` includes parity contract regression between tenant diagnostics and stock-alerts under same scope.
- `backend/src/routes/admin.routes.test.ts` includes audit-context regression asserting role/sessionStoreId/resolvedStoreId/requestPath.

### #P5-005 Validation and error hygiene
- [ ] Review validation on all newly touched endpoints.
- [ ] Normalize error payloads so internal details stay hidden.
- [ ] Add tests for invalid input and error formatting.

### #P5-006 Cross-page parity regressions
- [x] Add backend parity contract regression for same tenant/same threshold (`tenant/visibility-diagnostics` vs `stock-alerts`).
- [x] Add broader end-to-end parity suite across Inventory/Pricing/Low Stock/Storefront with shared tenant+filters.

Evidence:
- `backend/src/routes/multi-tenant-parity.contract.test.ts` validates tenant-scoped parity contracts across `/api/listings`, `/api/listings/available`, `/api/listings/low-stock`, and `/api/admin/tenant/visibility-diagnostics`.

## Validation Plan

1. Run backend type-check after each sprint-sized batch.
2. Run the targeted backend tests for the touched services/routes.
3. Manually verify the admin and inventory flows that depend on the changed authorization and stock logic.

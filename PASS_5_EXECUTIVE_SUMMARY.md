# Pass 5: Mixed Production Hardening

**Status**: In progress

**Goal**: close the highest-risk gaps that remain after Pass 4, prioritizing multi-tenancy safety, RBAC, stock consistency, and audit/validation hardening.

---

## Focus Areas

### #P5-001: Multi-tenancy and store scoping

**Current status**
- Planned: review storeId-sensitive reads and writes across backend services and routes.
- Planned: identify any flows that still infer store context implicitly instead of validating it.
- Planned: define a safe backfill/migration path if any persisted data still lacks store scoping.

**Acceptance**
- [ ] Critical store-scoped operations require explicit or safely inferred store context.
- [ ] No admin or catalog flow leaks data across stores.
- [ ] Any legacy unscoped records have a documented migration path.

### #P5-002: RBAC by action

**Current status**
- Planned: map ADMIN, MANAGER, and STAFF to concrete permissions.
- Planned: protect sensitive admin routes with action-level guards.
- Planned: keep UI actions aligned with backend authorization.

**Acceptance**
- [ ] Sensitive actions are blocked server-side for unauthorized roles.
- [ ] UI does not expose actions that the backend rejects.
- [ ] Permission checks are explicit and testable.

### #P5-003: Concurrency and stock safety

**Current status**
- Planned: review reservation, checkout, and inventory mutation paths for race conditions.
- Planned: add optimistic locking or equivalent safeguards where read-modify-write collisions are possible.
- Planned: verify concurrent stock changes behave deterministically under test.

**Acceptance**
- [ ] Concurrent stock mutations do not oversell inventory.
- [ ] Reservation and checkout flows handle contention safely.
- [ ] Tests cover the main race-condition paths.

### #P5-004: Audit and validation hardening

**Current status**
- Planned: improve change logging for sensitive entities and operations.
- Planned: bind critical actions to the acting admin when possible.
- Planned: keep API validation and error responses consistent so internal details are not exposed.

**Acceptance**
- [ ] Critical mutations leave an auditable trail.
- [ ] API errors remain normalized and non-leaky.
- [ ] Validation failures are predictable and user-safe.

---

## Execution Order

1. Close store scoping gaps.
2. Lock down permissions with RBAC.
3. Harden concurrent inventory and checkout behavior.
4. Finish audit and validation improvements.

---

## Verification

1. Run focused backend tests for any touched services and routes.
2. Run type-check after each implementation batch.
3. Validate the affected flows manually in the admin/storefront UI after the backend changes land.

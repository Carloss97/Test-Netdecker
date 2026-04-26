# Pass 5: Mixed Production Hardening

**Status**: In progress (P5-002 and P5-003 completed; P5-001 partially completed)

**Goal**: close the highest-risk gaps that remain after Pass 4, prioritizing multi-tenancy safety, RBAC, stock consistency, and audit/validation hardening.

---

## Focus Areas

### #P5-001: Multi-tenancy and store scoping

**Current status**
- Completed: enforced store scoping in key listing and admin flows (`/listings/available`, dashboard/reporting paths, tenant-aware cache keys).
- Completed: hardened tenant resolution so store-scoped admin sessions cannot override store context via request headers.
- In progress: define/confirm migration path only if legacy unscoped persisted records are detected.

**Acceptance**
- [x] Critical store-scoped operations require explicit or safely inferred store context.
- [x] No admin or catalog flow leaks data across stores.
- [ ] Any legacy unscoped records have a documented migration path.

### #P5-002: RBAC by action

**Current status**
- Completed: role model clarified as global `ADMIN` vs store-scoped admin sessions.
- Completed: sensitive admin routes and store management endpoints enforced server-side by action and tenant scope.
- Completed: UI aligned so store-scoped admins cannot switch tenant from layout store selector.

**Acceptance**
- [x] Sensitive actions are blocked server-side for unauthorized roles.
- [x] UI does not expose actions that the backend rejects.
- [x] Permission checks are explicit and testable.

### #P5-003: Concurrency and stock safety

**Current status**
- Completed: checkout and POS sale decrements moved to atomic guarded updates (`quantity >= requested`) with tenant-aware filters.
- Completed: contention-safe behavior enforced in reservation/checkout paths.
- Completed: concurrency tests and focused regressions validated deterministic outcomes.

**Acceptance**
- [x] Concurrent stock mutations do not oversell inventory.
- [x] Reservation and checkout flows handle contention safely.
- [x] Tests cover the main race-condition paths.

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

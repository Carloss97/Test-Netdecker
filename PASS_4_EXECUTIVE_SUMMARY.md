# Pass 4: Frontend Production Hardening

**Status**: Drafted and in progress

**Goal**: move from hardened core flows to a production-ready frontend with consistent API contracts, better observability, and lower rendering overhead.

---

## Focus Areas

### #P4-001: Normalize catalog API responses and raise coverage

**Why this first**
- `frontend/src/services/catalog.ts` is still the largest frontend hotspot.
- It contains repeated response-shape normalization for listings.
- The current summary already flags this file as the best place to recover coverage quickly.

**Planned work**
- Unify listing payload normalization for `getAvailableListings()` and `getListingsByCard()`.
- Keep backend and local fallback behavior aligned.
- Add tests for the shared normalization path.

**Acceptance**
- Shared normalization helper is used by both endpoints.
- API array payloads and `{ listings: [...] }` payloads render the same shape.
- Tests cover both API success and fallback branches.

### #P4-002: Standardize async page states

**Why**
- Several API-consuming pages still assume success-path data too early.
- We want explicit loading, empty, error, and retry states across the storefront and admin surfaces.

**Planned work**
- Review the main storefront pages and the admin dashboard.
- Add consistent retryable errors and empty-state copy.
- Remove silent failures where the UI currently falls back too quietly.

### #P4-003: Frontend observability

**Why**
- API issues are still hard to distinguish from rendering issues in the browser.
- Better client-side traceability will reduce debugging time in staging and production.

**Planned work**
- Add structured client-side logging for failed catalog and checkout requests.
- Propagate request context where useful.
- Keep user-facing messages localized and non-technical.

### #P4-004: Catalog rendering performance

**Why**
- The storefront is now feature-complete enough that render cost matters.
- Search, filtering, and dense card grids can be improved without changing backend contracts.

**Planned work**
- Measure the current catalog page behavior.
- Reduce unnecessary re-renders and expensive list work.
- Split or defer heavy UI work only where the data proves it helps.

---

## Execution Order

1. Finish `#P4-001` and validate the frontend test suite.
2. Move to `#P4-002` once the catalog service is stable.
3. Only then widen to observability and performance work.

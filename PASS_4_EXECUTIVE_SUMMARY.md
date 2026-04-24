# Pass 4: Frontend Production Hardening

**Status**: In progress (P4-001/002/003 complete; P4-004 pending)

**Goal**: move from hardened core flows to a production-ready frontend with consistent API contracts, better observability, and lower rendering overhead.

---

## Focus Areas

### #P4-001: Normalize catalog API responses and raise coverage

**Current status (2026-04-24)**
- Done: shared normalization helper added and consumed by both `getAvailableListings()` and `getListingsByCard()`.
- Done: tests added for array payloads, wrapped `{ listings: [...] }` payloads, and local fallback filtering.
- Validation: `vitest run src/services/catalog.test.ts` passing (18/18).

**Why this first**
- `frontend/src/services/catalog.ts` is still the largest frontend hotspot.
- It contains repeated response-shape normalization for listings.
- The current summary already flags this file as the best place to recover coverage quickly.

**Planned work**
- Unify listing payload normalization for `getAvailableListings()` and `getListingsByCard()`.
- Keep backend and local fallback behavior aligned.
- Add tests for the shared normalization path.

**Acceptance**
- [x] Shared normalization helper is used by both endpoints.
- [x] API array payloads and `{ listings: [...] }` payloads render the same shape.
- [x] Tests cover both API success and fallback branches.

### #P4-002: Standardize async page states

**Current status (2026-04-24)**
- Done: [frontend/src/pages/Catalog.tsx](frontend/src/pages/Catalog.tsx) now has explicit search loading/error/empty states plus retry actions for TCG load, card search, and per-card listings fetch.
- Done: [frontend/src/pages/CardSearchPage.tsx](frontend/src/pages/CardSearchPage.tsx) now exposes retry for failed searches and shows explicit per-card listing load errors instead of silently falling back to empty tables.
- Done: [frontend/src/pages/AdminDashboard.tsx](frontend/src/pages/AdminDashboard.tsx) now shows explicit loading/error blocks for pricing configuration fetch with retry action.
- Delivered bugfix: storefront checkout is now connected to backend order creation in [frontend/src/pages/CheckoutPage.tsx](frontend/src/pages/CheckoutPage.tsx) instead of mock-only local clear.
- Done: [frontend/src/pages/StorefrontPage.tsx](frontend/src/pages/StorefrontPage.tsx) now offers explicit retry for catalog load failures and reacts to store changes without manual refresh.
- Done: [frontend/src/pages/ImportPage.tsx](frontend/src/pages/ImportPage.tsx) now surfaces loading/error/retry states for TCG and import-history base fetches.
- Delivered bugfix: [frontend/src/services/catalog.ts](frontend/src/services/catalog.ts) now merges API TCG responses with the full supported TCG baseline so Import/Catalog selectors still show all integrated games even when backend only returns partial rows.
- Done: [frontend/src/pages/InventoryPage.tsx](frontend/src/pages/InventoryPage.tsx) now exposes explicit error+retry states for TCG, edition, and card loading flows, instead of relying only on a generic page error.

**Acceptance**
- [x] Critical API pages show explicit loading/error/empty states.
- [x] Primary fetch failures provide retry actions.
- [x] Inventory/Storefront/Import flows avoid silent fallback behavior.

**Why**
- Several API-consuming pages still assume success-path data too early.
- We want explicit loading, empty, error, and retry states across the storefront and admin surfaces.

**Planned work**
- Review the main storefront pages and the admin dashboard.
- Add consistent retryable errors and empty-state copy.
- Remove silent failures where the UI currently falls back too quietly.

### #P4-003: Frontend observability

**Current status (2026-04-24)**
- Done: structured client logger added in [frontend/src/utils/observability.ts](frontend/src/utils/observability.ts).
- Done: catalog and card-search failures now emit structured logs with context in [frontend/src/pages/Catalog.tsx](frontend/src/pages/Catalog.tsx) and [frontend/src/pages/CardSearchPage.tsx](frontend/src/pages/CardSearchPage.tsx).
- Done: POS checkout failures now emit structured logs with cart context in [frontend/src/pages/PosPage.tsx](frontend/src/pages/PosPage.tsx).
- Done: API client interceptor now emits structured diagnostics for HTML API responses and 401 redirect handling in [frontend/src/services/api.ts](frontend/src/services/api.ts).
- Delivered bugfix: store switching now remounts page content and dispatches a store-changed event from [frontend/src/components/Layout.tsx](frontend/src/components/Layout.tsx) so UI changes apply immediately without manual refresh.
- Done: global runtime and render errors are now emitted through structured observability in [frontend/src/main.tsx](frontend/src/main.tsx) and [frontend/src/components/ErrorBoundary.tsx](frontend/src/components/ErrorBoundary.tsx).
- Done: remaining POS operational flows now use structured observability in [frontend/src/pages/PosPage.tsx](frontend/src/pages/PosPage.tsx), admin accounts load errors are logged via [frontend/src/pages/AdminAccountsPage.tsx](frontend/src/pages/AdminAccountsPage.tsx), and admin login storage warnings are logged via [frontend/src/pages/AdminLogin.tsx](frontend/src/pages/AdminLogin.tsx).
- Delivered bugfix: storefront fallback demo dataset was removed in [frontend/src/hooks/useStorefront.ts](frontend/src/hooks/useStorefront.ts) to avoid exposing sample cards (Lightning Bolt / Black Lotus / Pokémon demo content) during API failures.
- Done: inventory page load failures now emit structured logs (TCGs, editions, cards, CSV/template operations) through [frontend/src/utils/observability.ts](frontend/src/utils/observability.ts) from [frontend/src/pages/InventoryPage.tsx](frontend/src/pages/InventoryPage.tsx).
- Validation uplift: frontend unit coverage increased from 63.76% to 66.15% across two passes, including targeted tests for [frontend/src/utils/observability.ts](frontend/src/utils/observability.ts), [frontend/src/hooks/useAsync.ts](frontend/src/hooks/useAsync.ts), [frontend/src/hooks/useStorefront.ts](frontend/src/hooks/useStorefront.ts), [frontend/src/services/stores.ts](frontend/src/services/stores.ts), and [frontend/src/pages/InventoryPage.tsx](frontend/src/pages/InventoryPage.tsx).

**Acceptance**
- [x] Critical frontend failures emit structured logs with context.
- [x] Runtime and unhandled promise errors are captured centrally.
- [x] Remaining direct page-level console warning/error diagnostics were replaced by observability helpers.

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

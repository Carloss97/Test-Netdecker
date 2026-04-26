# Pass 5 Multi-Tenant Stabilization Plan

## Context and objective

This plan addresses persistent production issues reported in multi-tenant behavior:

- A store-scoped admin can still see or switch to other stores.
- Inventory shows cards/sets, but cards do not appear consistently in Pricing, Low Stock, and Demo Storefront.
- There is no clear account identity in the UI, causing confusion about who is logged in (global admin vs store admin).
- Permissions and tenant visibility are inconsistent across routes and screens.

Main objective:
- Make tenant scope deterministic and observable across backend, frontend, and test flows.

## Reported incidents to resolve

1. Tenant switch leakage:
- Store admin can view/switch to stores outside their scope.

2. Cross-screen visibility mismatch:
- Same data appears in Inventory but not in Pricing/Low Stock/Storefront.

3. Missing account identity UX:
- No strong indicator of current account, role, and store scope in header.

4. RBAC ambiguity:
- Role permissions and tenant restrictions are not consistently enforced and surfaced.

## Root-cause hypotheses (current code behavior)

1. Tenant context source is fragmented:
- Tenant can be derived from session, x-store-id header, local storage, and route defaults.
- Result: one screen can resolve tenant differently than another.

2. Store visibility and store mutation are not fully separated:
- Global admin use case and scoped-admin use case still share some UI/backend paths.

3. Catalog list semantics differ by page:
- Pricing, Low Stock, and Storefront apply different filters (stock, status, tcg) without a common diagnostics layer.

4. Identity state is not first-class in layout:
- UI has no persistent identity chip with role and scope state.

## Workstreams

### WS-1: Single source of truth for tenant context

Backend actions:
- Enforce session store scope precedence for scoped sessions.
- Reject cross-store overrides for scoped sessions (headers, query, route-level overrides).
- Add explicit helper in admin routes:
  - effectiveStoreId
  - isGlobalAdmin

Frontend actions:
- Keep auth_store synchronized from admin/auth/me.
- For scoped sessions, lock store selector and show read-only tenant scope.
- For global admin, allow switching and show explicit switch mode.

Acceptance:
- Scoped admin always resolves to one store in all admin and listing endpoints.
- Global admin can switch store, and switch is reflected consistently in all pages.

### WS-2: Data visibility parity across Inventory, Pricing, Low Stock, Storefront

Actions:
- Define canonical listing visibility contract per page:
  - Inventory: all listing rows for effective tenant scope.
  - Pricing: in-stock active/manual listings for effective tenant scope.
  - Low Stock: threshold filter over active/manual listings for effective tenant scope.
  - Storefront: public catalog uses effective tenant context and same availability logic.
- Add one backend diagnostics endpoint for tenant visibility parity:
  - counts per page contract using same effectiveStoreId.
- Add frontend empty-state diagnostics message:
  - current store, current filters, and quick action to reset filters.

Acceptance:
- If a card is in Inventory and matches Pricing/Storefront criteria, it appears in those pages.
- If a card is absent, UI shows why (stock, status, filter, store context).

### WS-3: RBAC and tenant-scope matrix hardening

Actions:
- Publish and enforce explicit matrix:
  - global ADMIN: full cross-store capability.
  - scoped ADMIN: full actions within own store only.
  - MANAGER/STAFF: action-limited and own store only.
- Add explicit server-side deny reasons for forbidden actions (without leaking internals).
- Align frontend action rendering to same matrix.

Acceptance:
- No sensitive action can be executed outside authorized role and store scope.
- UI no longer exposes controls that backend denies for the same user context.

### WS-4: Identity and session clarity in UI

Actions:
- Add permanent identity panel in Layout header:
  - email
  - role
  - global/scoped mode
  - effective store name/id
- Add visual warning badge for scoped sessions.
- Add manual refresh button for session identity state.

Acceptance:
- User can always identify who is logged in and which scope is active.

### WS-5: Regression and observability

Actions:
- Expand tests for:
  - scoped admin cannot switch tenant by header or UI state.
  - parity between Inventory/Pricing/Low Stock/Storefront counts for same tenant and filters.
  - role matrix allow/deny paths.
- Add audit/telemetry fields in admin request logs:
  - userId, role, sessionStoreId, resolvedStoreId, requestPath.

Acceptance:
- CI catches tenant leakage and role mismatches before release.
- Support can debug page visibility mismatch from logs without DB guesswork.

## Delivery phases

Phase A progress (2026-04-25):
- Completed: tenant resolution added to admin routes with effectiveStoreId selection for global admin store switching and scoped-admin pinning.
- Completed: minimal diagnostics endpoint `GET /api/admin/tenant/visibility-diagnostics` for cross-page visibility parity counts.
- Completed: layout identity panel showing logged account, role, scope mode, and manual session refresh.

Phase B progress (2026-04-25):
- Completed: admin dashboard now consumes tenant visibility diagnostics and surfaces parity hints for inventory vs pricing counts.
- Completed: pricing page supports `ALL` TCG filter and actionable empty-state copy with active store context.
- Completed: low-stock and storefront pages show explicit tenant/filter context when result set is empty, with a quick filter reset path in storefront.

Phase B progress (2026-04-26):
- Completed: backend alignment for RBAC matrix on sensitive global operations (`/api/admin/pricing-config` and `/api/admin/catalog/reset`) with global-admin-only enforcement.
- Completed: regression coverage added to prevent non-global or scoped sessions from mutating global pricing/reset settings.

Phase C progress (2026-04-26):
- Started: observability hardening in admin audit trail now records role, session store, resolved store, and request path for tenant-debug workflows.
- Started: regression suite expanded with explicit deny-path tests for global settings endpoints.
- Completed: backend parity regression validates diagnostics/stock-alerts contract for same tenant and threshold.
- Completed: audit regression validates role/sessionStoreId/resolvedStoreId/requestPath capture in admin audit middleware.

Verification snapshot (2026-04-26):
- Backend admin hardening suites pass: `backend/src/routes/admin.routes.test.ts`.
- Backend tenant/RBAC suites pass: `backend/src/routes/listing.routes.test.ts`, `backend/src/middleware/tenantResolver.test.ts`, `backend/src/middleware/requirePermission.test.ts`.
- Frontend parity UX suites pass: `frontend/src/pages/PricingPage.test.tsx`, `frontend/src/pages/LowStockPage.test.tsx`.
- Type-check passes in backend and frontend.

Phase A (urgent hotfix):
- WS-1 backend enforcement final pass.
- WS-4 identity panel in UI.
- Minimal parity diagnostics endpoint.

Phase B (stabilization):
- WS-2 full parity contract and empty-state diagnostics.
- WS-3 matrix alignment pass in backend + frontend.

Phase C (guardrails):
- WS-5 regression suite completion and observability hardening.

## Definition of done

All of the following are true:

1. Scoped admin cannot view/switch/edit other stores.
2. Same tenant and filters produce consistent expected results across Inventory, Pricing, Low Stock, and Storefront.
3. Header clearly shows logged account, role, and effective store scope.
4. RBAC behavior is deterministic and tested for allow/deny paths.
5. Multi-tenant regressions are covered by focused automated tests and type-check.

## Manual validation script

1. Login as global admin:
- Switch stores and verify each page updates consistently.

2. Login as scoped admin:
- Verify store selector is locked.
- Verify all pages use scoped store data only.
- Verify forbidden cross-store actions are blocked.

3. For one known listing:
- Confirm visibility contract in Inventory, Pricing, Low Stock, and Storefront under same store and filters.

4. Verify identity panel:
- Email, role, and scope must always be visible and correct.

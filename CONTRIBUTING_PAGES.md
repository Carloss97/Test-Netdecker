# Contributing: Pages and Tenant Safety

## Tenant Scope Rules (Mandatory)

- `storeId` is mandatory for `Listing`, `Order`, and `Cart` records.
- Any non-admin endpoint that reads listings must resolve tenant context and filter by `storeId`.
- Public storefront/catalog calls must include tenant resolution (`x-store-slug`, `x-tenant-slug`, slug params, or equivalent resolver path).
- Never create listings without a resolved `storeId`.

## API Guidance

- For listing APIs, always use tenant-aware service methods and pass `req.store.id`.
- For cart/checkout flows, ensure cart and resulting order are persisted with the same `storeId`.
- For import/sync flows that create listings, resolve a store context explicitly before writing.

## Admin RBAC Guidance

- Admin APIs must enforce `requireAdmin` and action-based `requirePermission(action, resource)`.
- `ADMIN` is allowed by default for all actions.
- `MANAGER` and `STAFF` are constrained by permission matrix and, when tenant context exists, by store scope (`adminUser.storeId` must match request store).

Required permissions by endpoint family:

- `GET /api/admin/dashboard` -> `view:dashboard`
- `GET /api/admin/stock-alerts` -> `view:stock-alerts`
- `GET /api/admin/price-volatility` -> `view:price-volatility`
- `GET /api/admin/editions` -> `view:edition`
- `POST /api/admin/catalog/bootstrap` -> `run:catalog-bootstrap` (plus ADMIN role requirement)
- `POST /api/admin/catalog/sync` -> `run:catalog-sync` (plus ADMIN role requirement)
- `GET|POST|PATCH|DELETE /api/admin/accounts` -> `view|create|update|delete:account`
- `GET|POST|PATCH|DELETE /api/admin/thresholds` -> `view|create|update|delete:threshold`
- `GET|POST|PATCH /api/admin/stores` -> `view|create|update:store`, and rotate key uses `rotate:store-key`
- `GET /api/admin/approvals/pending` -> `view:price-approval`
- `POST /api/admin/approvals/:id/approve` -> `approve:price`
- `POST /api/admin/approvals/:id/reject` -> `reject:price`
- `GET /api/admin/audit` -> `view:audit`

## Optimistic Locking Rules

- `Reservation` and `OrderItem` use a `version` field for concurrency control.
- Mutations that can race must update with version checks (`updateMany where id + version`) and throw `ConflictError` when the row was modified concurrently.
- API clients must handle HTTP `409` as a recoverable conflict (reload cart/state and retry).

## Audit Entity-Change Rules

- For business mutations in `PriceService`, `ListingService`, and `OrderService`, call `AuditService.auditEntityChange(...)` with `oldValue`, `newValue`, and `operation`.
- Use `GET /api/admin/audit?entityType=<type>&entityId=<id>` to inspect before/after change history.
- `PriceHistory.changedBy` must reference a valid `AdminUser.id`; non-user/system updates should persist `changedBy` as `null`.

## Validation

Before opening a PR for catalog/cart/order changes:

1. Confirm no listing reads are unscoped in non-admin routes.
2. Run `npm --prefix backend run type-check`.
3. Run `npm run build` from repo root.

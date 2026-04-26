# Pass 5 Sprint 1: Store Scoping Notes

## Scope

This note closes the remaining Sprint 1 documentation tasks for P5-001:

1. Identify store-scoped entities and service methods.
2. Document migration/backfill checks for legacy records with nullable storeId.

## Store-scoped entities (Prisma)

Mandatory store-scoped models:
- Listing: backend/prisma/schema.prisma (model Listing, storeId required)
- Cart: backend/prisma/schema.prisma (model Cart, storeId required)
- Order: backend/prisma/schema.prisma (model Order, storeId required)

Nullable store-scoped models that may require legacy cleanup:
- InventoryImport, Warehouse, Account, JournalEntry, FiscalPeriod
- Invoice, POSSession, CashSession, CashDiscrepancyLog
- PriceSyncRun, AdminSession

References:
- backend/prisma/schema.prisma:210
- backend/prisma/schema.prisma:746
- backend/prisma/schema.prisma:784
- backend/prisma/schema.prisma:318
- backend/prisma/schema.prisma:565
- backend/prisma/schema.prisma:672
- backend/prisma/schema.prisma:691
- backend/prisma/schema.prisma:727
- backend/prisma/schema.prisma:818
- backend/prisma/schema.prisma:848
- backend/prisma/schema.prisma:875
- backend/prisma/schema.prisma:903
- backend/prisma/schema.prisma:962
- backend/prisma/schema.prisma:457

## Store-sensitive service methods reviewed

Listing and inventory reads/writes:
- ListingService.getAvailableListings(..., storeId?)
- ListingService.listListings(..., storeId?)
- ListingService.getLowStockAlerts(..., storeId?)
- ListingService.createListing({ storeId, ... })
- ListingService.getInventoryValue(storeId?)

Checkout and POS mutations:
- CartService.addToCart({ storeId, ... })
- CartService.updateItemQuantity(..., storeId)
- CartService.checkout(..., storeId)
- PaymentService.processPosSale({ ..., storeId? }) with effectiveStoreId validation

References:
- backend/src/services/ListingService.ts
- backend/src/services/CartService.ts:7
- backend/src/services/CartService.ts:204
- backend/src/services/PaymentService.ts:22
- backend/src/services/PaymentService.ts:65

## Guards completed in Sprint 1

Backend:
- /api/listings/available now requires tenant context.
- tenantResolver enforces admin session store over request header overrides.
- RBAC now distinguishes global ADMIN from store-scoped ADMIN sessions.
- Store management endpoints are restricted to global admin.

Frontend:
- Layout store switcher is locked when admin/auth/me returns a scoped storeId.

References:
- backend/src/routes/listing.routes.ts:31
- backend/src/middleware/tenantResolver.ts:47
- backend/src/middleware/requirePermission.ts:13
- backend/src/routes/admin.stores.routes.ts:15
- frontend/src/components/Layout.tsx:45

## Migration and backfill checks for legacy nullable storeId rows

Run these checks before forcing NOT NULL migrations on nullable storeId models:

```sql
SELECT 'InventoryImport' AS table_name, COUNT(*) AS null_store_rows FROM "InventoryImport" WHERE "storeId" IS NULL
UNION ALL
SELECT 'Warehouse', COUNT(*) FROM "Warehouse" WHERE "storeId" IS NULL
UNION ALL
SELECT 'Account', COUNT(*) FROM "Account" WHERE "storeId" IS NULL
UNION ALL
SELECT 'JournalEntry', COUNT(*) FROM "JournalEntry" WHERE "storeId" IS NULL
UNION ALL
SELECT 'FiscalPeriod', COUNT(*) FROM "FiscalPeriod" WHERE "storeId" IS NULL
UNION ALL
SELECT 'Invoice', COUNT(*) FROM "Invoice" WHERE "storeId" IS NULL
UNION ALL
SELECT 'POSSession', COUNT(*) FROM "POSSession" WHERE "storeId" IS NULL
UNION ALL
SELECT 'CashSession', COUNT(*) FROM "CashSession" WHERE "storeId" IS NULL
UNION ALL
SELECT 'CashDiscrepancyLog', COUNT(*) FROM "CashDiscrepancyLog" WHERE "storeId" IS NULL
UNION ALL
SELECT 'PriceSyncRun', COUNT(*) FROM "PriceSyncRun" WHERE "storeId" IS NULL
UNION ALL
SELECT 'AdminSession', COUNT(*) FROM "AdminSession" WHERE "storeId" IS NULL;
```

Backfill policy:
- If rows are operationally tenant-specific and inferable from related rows, backfill deterministically.
- If rows are global or not inferable, keep nullable and document semantics explicitly.
- Do not assign synthetic storeId blindly.

Suggested deterministic examples:
- CashDiscrepancyLog from CashSession:

```sql
UPDATE "CashDiscrepancyLog" d
SET "storeId" = c."storeId"
FROM "CashSession" c
WHERE d."cashSessionId" = c."id"
  AND d."storeId" IS NULL
  AND c."storeId" IS NOT NULL;
```

- Invoice from Order:

```sql
UPDATE "Invoice" i
SET "storeId" = o."storeId"
FROM "Order" o
WHERE i."orderId" = o."id"
  AND i."storeId" IS NULL
  AND o."storeId" IS NOT NULL;
```

## Validation evidence for Sprint 1

Focused tests already cover store isolation and RBAC paths:
- backend/src/routes/listing.routes.test.ts
- backend/src/middleware/tenantResolver.test.ts
- backend/src/middleware/requirePermission.test.ts
- backend/src/routes/admin.routes.test.ts

Type checks run successfully:
- npm --prefix backend run type-check
- npm --prefix frontend run type-check

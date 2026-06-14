# Current Repository Audit Appendix

> Este apéndice resume el estado del repositorio usado como referencia. No debe copiarse ciegamente al nuevo repo; sirve para entender alcance, entidades y rutas existentes.

## 1. Tamaño observado

Conteo físico aproximado excluyendo dependencias/build (medido con helper `simple_line_count.py`):

| Extensión | Archivos | Líneas físicas aproximadas |
|---|---:|---:|
| `.ts` | 281 | 43,856 |
| `.js` | 294 | 18,104 |
| `.tsx` | 64 | 13,366 |
| `.md` | 90 | 9,918 |
| Total auditado | 860 | 103,613 |

Conclusión: el repo actual ya es demasiado grande para “limpiarlo a mano” sin arrastrar deuda. El reinicio debe partir por módulos más pequeños y tests de invariantes.

## 2. Modelos Prisma detectados en schema SQLite local

| Modelo | Campos principales observados |
|---|---|
| `Store` | `id:String, slug:String, name:String, description:String?, apiKeyHash:String?, currency:String, taxRate:Float, createdAt:DateTime, updatedAt:DateTime, listings:Listing[], warehouses:Warehouse[], imports:InventoryImport[], carts:Cart[], orders:Order[]` |
| `TCG` | `id:String, name:String, displayName:String, description:String?, isActive:Boolean, createdAt:DateTime, updatedAt:DateTime, editions:Edition[], cards:Card[]` |
| `Edition` | `id:String, tcgId:String, tcg:TCG, editionCode:String, editionName:String, releaseDate:DateTime?, isActive:Boolean, createdAt:DateTime, updatedAt:DateTime, cards:Card[], listings:Listing[], priceVolatilityThresholds:PriceVolatilityThreshold[]` |
| `Card` | `id:String, tcgId:String, tcg:TCG, editionId:String, edition:Edition, cardCode:String, cardName:String, cardNumber:String?, rarity:String, colorIdentity:String?, cardType:String?, attribute:String?, metadata:String?, tags:String` |
| `Listing` | `id:String, cardId:String, card:Card, editionId:String, edition:Edition, condition:String, rarity:String, quantity:Int, referencePrice:Float, marginMultiplier:Float, exchangeRate:Float, finalPrice:Float, currency:String, costPrice:Float?` |
| `PriceHistory` | `id:String, listingId:String, listing:Listing, oldPrice:Float, newPrice:Float, oldReferencePrice:Float?, newReferencePrice:Float?, oldExchangeRate:Float?, newExchangeRate:Float?, reason:String, percentChange:Float, changedBy:String?, notes:String?, createdAt:DateTime` |
| `InventoryImport` | `id:String, fileName:String, fileHash:String, totalRecords:Int, successCount:Int, failureCount:Int, status:String, errors:String?, importedBy:String?, createdAt:DateTime, completedAt:DateTime?, storeId:String?, store:Store?, changes:InventoryImportChange[]` |
| `Cart` | `id:String, sessionId:String, storeId:String?, store:Store?, items:OrderItem[], createdAt:DateTime, updatedAt:DateTime` |
| `OrderItem` | `id:String, cartId:String?, cart:Cart?, orderId:String?, order:Order?, listingId:String, listing:Listing, quantity:Int, pricePerUnit:Float, subtotal:Float, createdAt:DateTime` |
| `Order` | `id:String, storeId:String?, store:Store?, orderNumber:String, customerEmail:String, status:String, items:OrderItem[], subtotal:Float, tax:Float, total:Float, shippingAddress:String?, notes:String?, createdAt:DateTime, updatedAt:DateTime` |
| `ExchangeRate` | `id:String, fromCurrency:String, toCurrency:String, rate:Float, source:String, fetchedAt:DateTime, expiresAt:DateTime?` |
| `PriceSyncRun` | `id:String, source:String, status:String, notes:String?, total:Int, updated:Int, volatile:Int, failed:Int, roundingMultiple:Int, errors:String?, startedAt:DateTime, completedAt:DateTime?, createdAt:DateTime, updatedAt:DateTime` |
| `FiscalPeriod` | `id:String, storeId:String?, store:Store?, startDate:DateTime, endDate:DateTime, status:String, createdAt:DateTime, updatedAt:DateTime` |
| `Warehouse` | `id:String, storeId:String?, store:Store?, name:String, address:String?, metadata:String?, stockMovements:StockMovement[], stockMovementsFrom:StockMovement[], stockMovementsTo:StockMovement[], stockSnapshots:StockSnapshot[], warehouseStocks:WarehouseStock[], reservations:Reservation[], createdAt:DateTime, updatedAt:DateTime` |
| `StockMovement` | `id:String, listingId:String, listing:Listing, warehouseId:String?, warehouse:Warehouse?, fromWarehouseId:String?, fromWarehouse:Warehouse?, toWarehouseId:String?, toWarehouse:Warehouse?, quantity:Int, type:String, reference:String?, performedBy:String?, notes:String?` |
| `StockSnapshot` | `id:String, listingId:String, listing:Listing, warehouseId:String?, warehouse:Warehouse?, quantity:Int, takenAt:DateTime` |
| `WarehouseStock` | `id:String, listingId:String, listing:Listing, warehouseId:String, warehouse:Warehouse, quantity:Int, createdAt:DateTime, updatedAt:DateTime` |
| `Reservation` | `id:String, listingId:String, listing:Listing, warehouseId:String?, warehouse:Warehouse?, quantity:Int, reservedBy:String?, status:String, expiresAt:DateTime?, createdAt:DateTime` |
| `Account` | `id:String, storeId:String?, store:Store?, code:String, name:String, type:String, description:String?, createdAt:DateTime, updatedAt:DateTime, journalLines:JournalLine[]` |
| `JournalEntry` | `id:String, storeId:String?, store:Store?, entryNumber:Int?, description:String?, date:DateTime, totalDebit:Float, totalCredit:Float, createdAt:DateTime, lines:JournalLine[]` |
| `JournalLine` | `id:String, journalEntryId:String, journalEntry:JournalEntry, accountId:String, account:Account, debit:Float, credit:Float, description:String?, createdAt:DateTime` |
| `ImportBatch` | `id:String, importId:String, import:InventoryImport, batchIndex:Int, startRow:Int?, endRow:Int?, status:String, createdAt:DateTime, changes:InventoryImportChange[]` |
| `InventoryImportChange` | `id:String, importId:String, import:InventoryImport, listingId:String, listing:Listing, batchId:String?, batch:ImportBatch?, oldQuantity:Int, newQuantity:Int, note:String?, createdAt:DateTime` |
| `PriceChangeApproval` | `id:String, listingId:String?, listing:Listing?, oldFinalPrice:Float?, newFinalPrice:Float, newReferencePrice:Float, marginMultiplier:Float, percentChange:Float, status:String, requestedBy:String?, processedBy:String?, processedAt:DateTime?, notes:String?, createdAt:DateTime` |
| `PriceVolatilityThreshold` | `id:String, tcg:String?, editionId:String?, edition:Edition?, thresholdPercent:Float, createdAt:DateTime, updatedAt:DateTime` |
| `AdminUser` | `id:String, email:String, passwordHash:String, passwordSalt:String, role:String, isActive:Boolean, lastLoginAt:DateTime?, createdAt:DateTime, updatedAt:DateTime, sessions:AdminSession[], auditTrails:AuditTrail[]` |
| `AdminSession` | `id:String, token:String, userId:String, user:AdminUser, expiresAt:DateTime?, createdAt:DateTime, storeId:String?, store:Store?` |
| `AuditTrail` | `id:String, userId:String?, user:AdminUser?, action:String, entity:String?, entityId:String?, ip:String?, userAgent:String?, data:String?, createdAt:DateTime` |
| `POSSession` | `id:String, sessionId:String, storeId:String?, store:Store?, userId:String?, items:String?, subtotal:Float, tax:Float, total:Float, status:String, transactions:PaymentTransaction[], createdAt:DateTime, updatedAt:DateTime` |
| `CashSession` | `id:String, sessionId:String, storeId:String?, store:Store?, openedBy:String?, closedBy:String?, startingCash:Float, endingCash:Float?, status:String, createdAt:DateTime, closedAt:DateTime?` |
| `PaymentTransaction` | `id:String, sessionId:String, session:POSSession, method:String, amount:Float, status:String, processorResponse:String?, processorReference:String?, createdAt:DateTime, updatedAt:DateTime` |

## 3. Rutas backend actuales detectadas

Estas rutas muestran el alcance funcional existente. En el nuevo repo conviene agruparlas bajo `/api/v1` y módulos explícitos.

### `admin.accounts.routes.ts`
- `GET /`
- `POST /`
- `PATCH /:id`
- `DELETE /:id`

### `admin.api-keys.routes.ts`
- `POST /:id/rotate`
- `GET /`

### `admin.approvals.routes.ts`
- `GET /pending`
- `POST /:id/approve`
- `POST /:id/reject`

### `admin.auth.routes.ts`
- `POST /create`
- `POST /login`
- `POST /logout`
- `GET /me`

### `admin.routes.ts`
- `GET /dashboard`
- `GET /tenant/visibility-diagnostics`
- `POST /tenant/normalize-in-stock-statuses`
- `GET /audit`
- `GET /reconciliation/reports`
- `POST /pos/sessions/:id/close`
- `GET /pos/discrepancies`
- `GET /stock-alerts`
- `GET /price-volatility`
- `GET /editions`
- `GET /tcgplayer-coverage`
- `POST /catalog/bootstrap`
- `POST /catalog/sync`
- `POST /pricing/preview`
- `GET /pricing-config`
- `POST /pricing-config`
- `POST /catalog/reset`

### `admin.stores.routes.ts`
- `POST /`
- `POST /:id/rotate-key`
- `GET /`
- `PATCH /:id`

### `admin.thresholds.routes.ts`
- `GET /`
- `POST /`
- `PATCH /:id`
- `DELETE /:id`

### `admin.webhooks.routes.ts`
- `GET /dlq`
- `POST /dlq/:id/retry`

### `analytics.routes.ts`
- `GET /sales-summary`
- `GET /revenue-by-tcg`

### `card.routes.ts`
- `GET /search`
- `GET /edition/:editionId`
- `GET /tcg/:tcgId`
- `GET /:id`

### `cart.routes.ts`
- `GET /:sessionId`
- `POST /:sessionId/add`
- `POST /:sessionId/checkout`
- `PATCH /:sessionId/item/:itemId`
- `DELETE /:sessionId/item/:itemId`

### `cashSessions.routes.ts`
- `POST /`
- `POST /:id/close`
- `GET /:id`

### `edition.routes.ts`
- `GET /`
- `GET /:id`
- `PATCH /:id/status`
- `GET /:id/cards-with-stock`
- `GET /:id/csv-template`

### `erp.routes.ts`
- `POST /stock/movement`
- `POST /stock/snapshot`
- `POST /stock/transfer`
- `POST /reservation`
- `POST /reservation/:id/commit`
- `POST /reservation/:id/release`
- `GET /stock/:listingId`

### `expense.routes.ts`
- `POST /`
- `GET /`
- `DELETE /:id`

### `external.routes.ts`
- `GET /search`
- `GET /sets`
- `GET /cards/:tcg/:cardId`
- `POST /import/card`
- `POST /import/search`
- `POST /import/set`
- `GET /ygoprodeck/card-sets`
- `GET /ygopro/cardsets.php`
- `GET /ygopro/cardinfo.php`
- `GET /optcgapi/cards`
- `POST /optcgapi/import/bulk`

### `health.routes.ts`
- `GET /`
- `GET /ready`

### `inventory.routes.ts`
- `GET /imports`
- `GET /imports/export`
- `POST /imports/:id/rollback`
- `GET /export-csv`
- `GET /export-david-xlsx`
- `GET /imports/:importId`
- `POST /update-quantity`
- `POST /bulk-update`
- `POST /decrease`
- `POST /import-csv`
- `POST /import-with-mapping`
- `POST /import-csv/validate`
- `GET /import-csv/template`

### `invoices.routes.ts`
- `POST /`
- `GET /:id`
- `GET /:id/pdf`
- `POST /cleanup`

### `listing.routes.ts`
- `GET /available`
- `GET /low-stock`
- `GET /inventory-value`
- `GET /`
- `POST /sync-prices`
- `GET /sync-prices/runs`
- `GET /sync-prices/runs/:runId`
- `POST /price-preview`
- `GET /price-history/export`
- `GET /card/:cardId`
- `GET /:id/price-debug`
- `GET /:id`
- `POST /batch-stock`
- `PATCH /:id/stock`
- `PATCH /:id/pricing-mode`

### `media.routes.ts`
- `POST /upload`
- `GET /uploads/:filename`
- `GET /image-proxy`

### `metrics.routes.ts`
- `GET /`

### `orders.routes.ts`
- `GET /`
- `GET /:id`
- `POST /:id/cancel`
- `POST /:id/ship`
- `POST /:id/deliver`
- `PATCH /:id/fulfillment`
- `GET /:id/receipt`

### `payments.routes.ts`
- `POST /pos-sale`
- `POST /stripe/create-intent`
- `POST /mercadopago/create-preference`
- `POST /stripe/webhook`
- `POST /mercadopago/webhook`

### `pos.cash.routes.ts`
- `POST /`
- `POST /:id/close`
- `GET /`

### `pos.routes.ts`
- `POST /sessions`
- `GET /sessions/:sessionId`
- `POST /sessions/:sessionId/transactions`
- `POST /sessions/:sessionId/complete`
- `GET /sessions/:sessionId/transactions`

### `pricing.routes.ts`
- `GET /approvals`
- `POST /approvals/:id/approve`
- `POST /approvals/:id/reject`

### `public.routes.ts`
- `GET /reviews/:listingId`
- `GET /:slug/catalogo`

### `storefrontAuth.routes.ts`
- `POST /register`
- `POST /login`
- `GET /me`
- `GET /orders`
- `GET /wishlist`
- `POST /wishlist`
- `POST /reviews`

### `storefrontCoupon.routes.ts`
- `GET /validate`

### `tcg.routes.ts`
- `GET /`
- `GET /:id`
- `PATCH /:id/status`

## 4. Páginas frontend actuales detectadas

| Página | Líneas aprox. | Observación |
|---|---:|---|
| `AdminAccountsPage.tsx` | 168 |  |
| `AdminDashboard.tsx` | 182 |  |
| `AdminLogin.tsx` | 99 |  |
| `CardSearchPage.test.tsx` | 134 | Test existente útil como referencia de comportamiento. |
| `CardSearchPage.tsx` | 790 | Archivo grande; dividir en componentes/hooks/módulos en el reinicio. |
| `Catalog.tsx` | 185 |  |
| `CatalogPage.tsx` | 507 | Archivo grande; dividir en componentes/hooks/módulos en el reinicio. |
| `CheckoutPage.tsx` | 304 |  |
| `DashboardPage.tsx` | 246 |  |
| `ExternalCardSearch.tsx` | 609 | Archivo grande; dividir en componentes/hooks/módulos en el reinicio. |
| `ImportMapper.tsx` | 185 |  |
| `ImportPage.tsx` | 697 | Archivo grande; dividir en componentes/hooks/módulos en el reinicio. |
| `InventoryImport.tsx` | 167 |  |
| `InventoryPage.test.tsx` | 299 | Test existente útil como referencia de comportamiento. |
| `InventoryPage.tsx` | 988 | Archivo grande; dividir en componentes/hooks/módulos en el reinicio. |
| `LocalImportsManager.tsx` | 217 |  |
| `LowStockPage.test.tsx` | 178 | Test existente útil como referencia de comportamiento. |
| `LowStockPage.tsx` | 269 |  |
| `OrderDetailPage.tsx` | 175 |  |
| `OrdersPage.tsx` | 157 |  |
| `PosPage.backup.tsx` | 3 |  |
| `PosPage.tsx` | 447 |  |
| `PricingAdmin.tsx` | 382 |  |
| `PricingPage.test.tsx` | 119 | Test existente útil como referencia de comportamiento. |
| `PricingPage.tsx` | 346 |  |
| `ProductDetailPage.tsx` | 269 |  |
| `ProfilePage.tsx` | 133 |  |
| `StorefrontLoginPage.tsx` | 84 |  |
| `StorefrontOrderDetailPage.tsx` | 113 |  |
| `StorefrontPage.tsx` | 296 |  |
| `StorefrontPageV2.tsx` | 326 |  |
| `StorefrontRegisterPage.tsx` | 121 |  |

## 5. Servicios backend relevantes a conservar conceptualmente

- `TCGCsvService.ts`: category IDs, throttle, cache, mapping de groups/products/prices. Rediseñar como cliente aislado y preservar `groupId`.
- `CardDatabaseService.ts`: fachada unificada hacia TCGCSV. Conservar idea, eliminar nombres legacy Scryfall/YGOPRO/Pokémon si no son proveedores reales.
- `ExternalImportService.ts`: upsert Card/Edition/Listing. Rediseñar como pipeline con dry-run y transacciones claras.
- `PriceSyncService.ts`: store-scoped sync y PriceSyncRun. Conservar invariantes, simplificar flujo.
- `InventoryService.ts`: contiene muchas responsabilidades; dividir en CSV parser, import service, stock service, rollback service, export service.
- `StoreHealthService.ts`: buena base conceptual para dashboard operativo store-scoped.
- `LocalBootstrapService.ts`: conservar patrón de tienda local + TCGs base idempotentes.

## 6. Problemas/decisiones aprendidas durante estabilización

1. `prebuild` debe usar prisma generate safe para SQLite local.
2. Vite debe usar `/api` same-origin proxy en WSL/Windows.
3. TCGCSV-only local mode debe bloquear providers externos antes de importar SDKs.
4. Dashboard/analytics deben responder 200 con DB vacía.
5. Hooks frontend no deben re-ejecutar por identidad de función inline.
6. Axios no debe reintentar requests canceladas.
7. Duplicate set codes deben resolverse con TCGCSV `groupId`.
8. Los jobs externos deben estar deshabilitados por default en local.
9. Inventario debe usar `finalPrice * quantity` para valor total.
10. Todo endpoint admin/store debe filtrar por `storeId` en servicio, no solo en ruta.

## 7. Recomendación de migración conceptual

No migrar código archivo-por-archivo. Migrar en este orden:

1. Esquema de datos limpio.
2. TCGCSV client + normalizadores.
3. Import set vertical slice.
4. Pricing puro.
5. Listings/inventario.
6. Dashboard.
7. POS.
8. Storefront.

Cada slice debe tener tests y smoke antes de avanzar.

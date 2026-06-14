# NetDeckER Data Model and API Specification

> **Para Hermes:** este documento define contratos de datos y APIs. Implementa primero los modelos/invariantes, luego rutas delgadas.

## 1. Principios de modelo de datos

1. Toda entidad operativa pertenece a una tienda (`storeId`) salvo catálogo global.
2. TCG/Edition/Card son catálogo canónico global/local, pero Listing es por tienda.
3. TCGCSV IDs (`categoryId`, `groupId`, `productId`) deben preservarse para sincronización futura.
4. Precio final no es dato mágico; siempre debe poder explicarse desde referencia, tasa, margen y redondeo.
5. Stock nunca cambia sin movimiento.
6. Importaciones deben poder auditarse y revertirse.
7. Ventas deben ser transaccionales y no permitir stock negativo.

## 2. Modelo conceptual canónico

### 2.1 Store

```ts
Store {
  id: string
  slug: string unique
  name: string
  currency: 'CLP'
  taxRate: number
  settings: Json
  createdAt: Date
  updatedAt: Date
}
```

Relaciones:

- tiene Listings,
- tiene Orders,
- tiene AdminUsers scoped,
- tiene InventoryImports,
- tiene POS/Cash sessions,
- tiene Warehouses futuros.

Invariantes:

- `slug` único y estable.
- Una tienda local default puede ser `local-store`.

### 2.2 TCG

```ts
TCG {
  id: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ'
  displayName: string
  tcgcsvCategoryId: number
  isActive: boolean
}
```

Recomendación:

- usar IDs semánticos estables (`MAGIC`) en vez de UUID para TCG.

### 2.3 Edition

```ts
Edition {
  id: string
  tcgId: string
  externalGroupId?: string       // TCGCSV groupId
  editionCode: string            // código público/abbreviation
  editionName: string
  releaseDate?: Date
  isActive: boolean
}
```

Unique recomendado:

```text
(tcgId, externalGroupId) unique when externalGroupId not null
(tcgId, editionCode, editionName) fallback unique
```

Por qué:

- Yu-Gi-Oh puede tener códigos públicos duplicados (`SRL-EN`, `PSV-EN`).
- Importar por `editionCode` solamente es ambiguo.

### 2.4 Card

```ts
Card {
  id: string
  tcgId: string
  editionId: string
  externalProductId: string      // TCGCSV productId
  cardCode: string               // compatibilidad, usualmente productId o código interno
  cardName: string
  cardNumber?: string
  rarity: string
  variant?: string               // Normal/Holofoil/etc.
  colorIdentity?: string
  cardType?: string
  attribute?: string
  metadata: Json
  imageUrl?: string
  description?: string
}
```

Unique recomendado:

```text
(tcgId, editionId, externalProductId, rarity, variant)
```

### 2.5 Listing

```ts
Listing {
  id: string
  storeId: string
  cardId: string
  editionId: string
  condition: 'NM' | 'LP' | 'MP' | 'HP' | 'DMG'
  rarity: string
  quantity: number
  reservedQuantity: number
  referencePriceUsd: number
  exchangeRateUsdClp: number
  marginMultiplier: number
  roundingMultiple: number
  finalPriceClp: number
  costPriceClp?: number
  pricingSource: 'tcgcsv' | 'manual' | 'stored' | 'fallback'
  status: 'active' | 'manual' | 'inactive' | 'archived'
  everHadStock: boolean
  lastSyncedAt?: Date
}
```

Unique recomendado:

```text
(storeId, cardId, condition, rarity)
```

Invariantes:

- `quantity >= 0`
- `reservedQuantity >= 0`
- `reservedQuantity <= quantity`
- `availableQuantity = quantity - reservedQuantity`
- No se vende si `availableQuantity < requested`.

### 2.6 StockMovement

```ts
StockMovement {
  id: string
  storeId: string
  listingId: string
  warehouseId?: string
  quantity: number
  type: 'IN' | 'OUT' | 'ADJUST' | 'TRANSFER' | 'RESERVE' | 'RELEASE'
  referenceType?: 'IMPORT' | 'POS' | 'ORDER' | 'ROLLBACK' | 'MANUAL'
  referenceId?: string
  performedBy?: string
  notes?: string
  createdAt: Date
}
```

Regla:

- Cada modificación de stock debe generar un movimiento.

### 2.7 InventoryImport

```ts
InventoryImport {
  id: string
  storeId: string
  fileName: string
  fileHash: string
  mode: 'listing-update' | 'full-upsert' | 'tcgcsv-set'
  status: 'validated' | 'completed' | 'failed' | 'rolled_back'
  totalRecords: number
  successCount: number
  failureCount: number
  errors: Json
  createdAt: Date
  completedAt?: Date
}
```

### 2.8 InventoryImportChange

```ts
InventoryImportChange {
  id: string
  importId: string
  listingId: string
  oldQuantity: number
  newQuantity: number
  oldPrice?: number
  newPrice?: number
  note?: string
}
```

Necesario para rollback.

### 2.9 PriceHistory

```ts
PriceHistory {
  id: string
  storeId: string
  listingId: string
  oldReferencePriceUsd?: number
  newReferencePriceUsd?: number
  oldFinalPriceClp: number
  newFinalPriceClp: number
  oldExchangeRate?: number
  newExchangeRate?: number
  percentChange: number
  reason: 'TCGCSV_SYNC' | 'MANUAL' | 'IMPORT' | 'VOLATILE_ALERT'
  changedBy?: string
  createdAt: Date
}
```

### 2.10 Order / OrderItem

```ts
Order {
  id: string
  storeId: string
  orderNumber: string
  customerEmail?: string
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'FULFILLED'
  paymentStatus: 'UNPAID' | 'PAID' | 'REFUNDED'
  fulfillmentStatus: 'PENDING_PAYMENT' | 'PAID' | 'SHIPPED' | 'DELIVERED'
  subtotalClp: number
  discountClp: number
  taxClp: number
  totalClp: number
  notes?: string
}

OrderItem {
  id: string
  orderId: string
  listingId: string
  quantity: number
  pricePerUnitClp: number
  subtotalClp: number
}
```

### 2.11 POSSession / CashSession / PaymentTransaction

```ts
POSSession {
  id: string
  storeId: string
  openedBy: string
  status: 'OPEN' | 'COMPLETED' | 'CANCELLED'
  subtotalClp: number
  totalClp: number
}

CashSession {
  id: string
  storeId: string
  openedBy: string
  closedBy?: string
  startingCashClp: number
  endingCashClp?: number
  status: 'OPEN' | 'CLOSED'
}

PaymentTransaction {
  id: string
  storeId: string
  orderId?: string
  posSessionId?: string
  method: 'CASH' | 'CARD_MANUAL' | 'TRANSFER' | 'STRIPE' | 'MERCADOPAGO'
  amountClp: number
  status: 'PENDING' | 'APPROVED' | 'FAILED' | 'REFUNDED'
  providerReference?: string
}
```

### 2.12 AuditTrail

```ts
AuditTrail {
  id: string
  storeId?: string
  userId?: string
  action: string
  entityType?: string
  entityId?: string
  diff?: Json
  metadata?: Json
  ip?: string
  userAgent?: string
  createdAt: Date
}
```

## 3. API design

### 3.1 Convenciones

Base:

```text
/api/v1
```

Headers:

```text
Authorization: Bearer <admin-session-token>
x-store-id: <store-id>              # solo global admin o local dev
x-store-slug: <store-slug>          # storefront/public
x-api-key: <store-api-key>          # integraciones futuras
```

Respuestas exitosas:

```json
{ "success": true, "data": {} }
```

Para listas:

```json
{
  "success": true,
  "data": [],
  "pagination": { "page": 1, "pageSize": 50, "total": 120 }
}
```

### 3.2 TCG y catálogo

```http
GET /api/v1/tcgs
PATCH /api/v1/tcgs/:id/status

GET /api/v1/editions?tcgId=MAGIC&activeOnly=true
GET /api/v1/editions/:id
PATCH /api/v1/editions/:id/status
GET /api/v1/editions/:id/cards-with-stock
GET /api/v1/editions/:id/csv-template

GET /api/v1/cards/search?query=charizard&tcgId=POKEMON
GET /api/v1/cards/:id
```

### 3.3 TCGCSV externo

```http
GET /api/v1/external/sets?tcg=YUGIOH
GET /api/v1/external/search?tcg=MAGIC&query=bolt
GET /api/v1/external/cards/:tcg/:productId
POST /api/v1/external/import/card
POST /api/v1/external/import/set
POST /api/v1/external/import/search
```

`GET /external/sets` debe responder:

```json
{
  "success": true,
  "data": [
    {
      "tcg": "YUGIOH",
      "code": "SRL-EN",
      "name": "Spell Ruler",
      "groupId": "12345",
      "releaseDate": "2002-09-16",
      "totalCards": 104,
      "source": "tcgcsv"
    }
  ]
}
```

Import set request:

```json
{
  "tcg": "YUGIOH",
  "setRef": { "groupId": "12345" },
  "createListings": true,
  "initialQuantity": 0,
  "marginMultiplier": 1.35,
  "dryRun": false
}
```

No usar solo `setCode` cuando existe `groupId`.

### 3.4 Listings/inventario

```http
GET /api/v1/listings?tcgId=MAGIC&editionId=...&search=...
GET /api/v1/listings/available?tcgId=MAGIC&editionId=...
GET /api/v1/listings/low-stock?threshold=5
GET /api/v1/listings/:id
PATCH /api/v1/listings/:id/stock
PATCH /api/v1/listings/:id/pricing
POST /api/v1/listings/batch-stock
```

Stock update:

```json
{
  "mode": "set" | "increment" | "decrement",
  "quantity": 5,
  "reason": "manual-adjustment",
  "notes": "conteo físico"
}
```

### 3.5 Import/export

```http
POST /api/v1/inventory/import-csv/validate
POST /api/v1/inventory/import-csv
GET /api/v1/inventory/imports?page=1&pageSize=20
GET /api/v1/inventory/imports/:id
POST /api/v1/inventory/imports/:id/rollback
GET /api/v1/inventory/export-csv?scope=all|tcg|edition&tcgId=&editionId=
GET /api/v1/inventory/import-csv/template
```

### 3.6 Pricing

```http
POST /api/v1/pricing/preview
POST /api/v1/pricing/sync
GET /api/v1/pricing/sync-runs
GET /api/v1/pricing/sync-runs/:id
GET /api/v1/pricing/history/export
GET /api/v1/pricing/approvals
POST /api/v1/pricing/approvals/:id/approve
POST /api/v1/pricing/approvals/:id/reject
GET /api/v1/admin/pricing-config
POST /api/v1/admin/pricing-config
```

Preview response:

```json
{
  "success": true,
  "data": {
    "referencePriceUsd": 2.5,
    "exchangeRateUsdClp": 1000,
    "marginMultiplier": 1.35,
    "roundingMultiple": 100,
    "finalPriceClp": 3400,
    "source": "tcgcsv"
  }
}
```

### 3.7 Dashboard/analytics

```http
GET /api/v1/admin/dashboard
GET /api/v1/analytics/sales-summary
GET /api/v1/analytics/revenue-by-tcg
```

Dashboard must work on empty DB.

### 3.8 POS

```http
POST /api/v1/pos/sessions
GET /api/v1/pos/sessions/:sessionId
POST /api/v1/pos/sessions/:sessionId/items
PATCH /api/v1/pos/sessions/:sessionId/items/:itemId
DELETE /api/v1/pos/sessions/:sessionId/items/:itemId
POST /api/v1/pos/sessions/:sessionId/complete
POST /api/v1/cash-sessions
POST /api/v1/cash-sessions/:id/close
```

Complete POS sale:

```json
{
  "paymentMethod": "CASH",
  "amountReceivedClp": 15000,
  "performedBy": "admin@example.com"
}
```

### 3.9 Orders/storefront

```http
GET /api/v1/public/:storeSlug/catalog
GET /api/v1/public/:storeSlug/listings/:id
POST /api/v1/cart/:sessionId/add
GET /api/v1/cart/:sessionId
POST /api/v1/cart/:sessionId/checkout
GET /api/v1/orders
GET /api/v1/orders/:id
PATCH /api/v1/orders/:id/fulfillment
POST /api/v1/orders/:id/cancel
GET /api/v1/orders/:id/receipt
```

## 4. Core workflows

### 4.1 Local bootstrap

1. Generate Prisma SQLite client.
2. Push SQLite schema.
3. Ensure default store `local-store`.
4. Ensure TCGs base.
5. Ensure admin dev bypass or default admin.
6. Start API.
7. Start Vite proxy `/api`.

Acceptance:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/tcgs
curl http://localhost:3000/api/admin/dashboard
```

### 4.2 Import set

1. User selects TCG.
2. Frontend calls `GET /external/sets?tcg=...`.
3. Backend returns sets with `groupId`.
4. User clicks import.
5. Frontend sends `{ tcg, setRef: { groupId } }`.
6. Backend fetches products/prices.
7. Backend upserts Edition/Card.
8. Backend creates Listings if requested.
9. Backend records InventoryImport.
10. UI shows summary.

### 4.3 CSV stock import

1. Upload CSV.
2. Validate parse/header/rows.
3. Show dry-run summary.
4. Confirm apply.
5. Apply in transaction/batches.
6. Create InventoryImport + changes + StockMovements.
7. Allow rollback.

### 4.4 POS sale

1. Open POS session.
2. Search listing.
3. Add item.
4. On complete, transaction:
   - validate stock,
   - create Order,
   - create OrderItems,
   - decrement stock,
   - create StockMovements,
   - create PaymentTransaction,
   - mark paid.
5. Return receipt.

## 5. Invariants to test first

1. Duplicate external set codes produce unique UI keys and import by groupId.
2. Listing cannot be sold below zero.
3. Store A cannot update Store B listing.
4. Import rollback restores previous quantities.
5. Price preview is deterministic with manual exchange rate.
6. Dashboard returns JSON with zero metrics on empty DB.
7. Canceled frontend requests are not retried.
8. Frontend data fetching does not refetch due to inline function identity.
9. Local mode never calls Stripe/MercadoPago/FX APIs.
10. CSV validation catches missing required columns before writes.

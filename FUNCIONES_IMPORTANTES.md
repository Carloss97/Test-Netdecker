# Funciones Importantes — Referencia Rápida

Este documento centraliza las funciones clave del sistema y endpoints principales.

---

## Frontend — `frontend/src/services/catalog.ts`

### Inventario y Stock

| Función | Descripción |
|---------|-------------|
| `getTCGs()` | Lista todos los TCGs registrados. |
| `getEditions({ tcgId?, activeOnly? })` | Lista ediciones/sets, filtradas por TCG si se pasa `tcgId`. |
| `getEditionCardsWithStock(editionId)` | Devuelve todas las cartas de una edición con sus listings (stock, precio, condición). |
| `batchUpdateStock(updates)` | Actualiza cantidades de múltiples listings en una sola petición. |
| `downloadEditionCsvTemplate(editionId)` | Descarga plantilla CSV para actualización masiva. |
| `importInventoryCsv(file)` | Importa un CSV/XLSX de stock (upsert completo). |
| `validateInventoryCsv(file)` | Valida el archivo sin importar. Muestra errores por fila. |
| `getInventoryImports(params?)` | Historial de importaciones paginado. |
| `getLowStockListings(threshold?)` | Listings con stock ≤ umbral (default 2). |

### Búsqueda de Cartas

| Función | Descripción |
|---------|-------------|
| `searchCards(name, tcgId?, limit?)` | Busca cartas por nombre (match parcial, case-insensitive). |
| `searchCardsByCode(code, tcgId?, limit?)` | Busca cartas por código (match parcial). |
| `getCardById(id)` | Detalle de una carta por su ID interno. |
| `getListingsByCard(cardId)` | Todos los listings de una carta. |

### Precios

| Función | Descripción |
|---------|-------------|
| `syncListingPrices(updates?, roundingMultiple?, notes?)` | Sincroniza precios desde APIs externas. |
| `getPriceSyncRuns(limit?)` | Historial de sincronizaciones de precios. |
| `getInventoryValue()` | Valor total del inventario en CLP. |
| `previewListingPrice(referencePrice, marginMultiplier, roundingMultiple?)` | Calcula precio final CLP sin guardar. |

### Catálogo Externo

| Función | Descripción |
|---------|-------------|
| `searchExternalCards(tcg, query, options?)` | Busca en APIs externas (Scryfall, PokémonTCG, YGOPRODeck, OPTCGAPI). |
| `listExternalSets(tcg)` | Lista sets disponibles en APIs externas. |
| `importExternalCard(params)` | Importa una carta individual al catálogo local. |
| `importExternalSearch(params)` | Importa todos los resultados de una búsqueda. |
| `importExternalSet(params)` | Importa un set completo desde una API externa. |
| `bootstrapCatalog(params?)` | Bootstrap masivo de catálogo. |
| `syncCatalog(params?)` | Sincroniza nuevos sets detectados en las APIs. |
| `resetCatalog()` | ⚠️ Borra todo el catálogo (cartas, ediciones, listings, historial). |

---

## Backend — `backend/src/services/`

### CardService

| Método | Descripción |
|--------|-------------|
| `createCard(input)` | Crea una nueva carta. |
| `getCard(id)` | Obtiene carta por ID (incluye listings). |
| `searchByName(name, tcgId?, limit?)` | Búsqueda por nombre, case-insensitive. |
| `searchByCode(code, tcgId?, limit?)` | Búsqueda por código de carta. |
| `findCardByCode(tcgId, editionId, cardCode, rarity?)` | Busca carta por clave única compuesta. |
| `getCardsByEdition(editionId)` | Todas las cartas de una edición. |
| `getCardsByTCG(tcgIdentifier)` | Todas las cartas de un TCG. |
| `bulkUpsertCards(cards[])` | Upsert masivo desde CSV/import. |

### InventoryService

| Método | Descripción |
|--------|-------------|
| `importCsv(file, importedBy)` | Procesa CSV/XLSX en modo upsert completo. |
| `validateCsv(file)` | Valida archivo y reporta errores por fila. |
| `getImports(params)` | Historial de importaciones paginado y filtrable. |

### ListingService

| Método | Descripción |
|--------|-------------|
| `getAvailableListings(tcgId?, editionId?)` | Listings con stock > 0. |
| `getLowStockListings(threshold?)` | Listings con stock ≤ umbral. |
| `getInventoryValue()` | Suma total de inventario en CLP. |
| `batchUpdateStock(updates[])` | Actualización masiva de cantidades. |

### PriceService

| Método | Descripción |
|--------|-------------|
| `updateListingPrice(listingId, newPrice, reason)` | Actualiza precio y crea registro histórico. |
| `isVolatileChange(oldPrice, newPrice, threshold?)` | Detecta si el cambio de precio es sospechoso. |
| `calculateFinalPrice(referenceUSD, margin, exchangeRate, rounding?)` | Calcula precio final CLP. |

### ExchangeRateService

| Método | Descripción |
|--------|-------------|
| `getRate()` | Obtiene tipo de cambio USD→CLP (cache o API externa). |
| `refresh()` | Fuerza actualización del tipo de cambio. |

---

## API Endpoints Clave

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `GET /api/cards/search?name=xxx` | GET | Buscar cartas por nombre |
| `GET /api/cards/search?code=xxx` | GET | Buscar cartas por código |
| `GET /api/editions/:id/cards-with-stock` | GET | Cartas + listings de una edición |
| `POST /api/listings/batch-stock` | POST | Actualización masiva de stock |
| `POST /api/inventory/import-csv` | POST | Importar CSV/XLSX de inventario |
| `GET /api/admin/dashboard` | GET | KPIs del dashboard admin |
| `POST /api/admin/catalog/bootstrap` | POST | Bootstrap masivo del catálogo |
| `POST /api/admin/catalog/reset` | POST | ⚠️ Reset completo del catálogo |

---

## Fórmula de Precio

```
finalPriceCLP = referencePrice (USD) × marginMultiplier × exchangeRate (USD→CLP)
```
Redondeado al múltiplo configurado (por defecto 50 CLP).

---

## Notas de Arquitectura

- Redis: cache de tipo de cambio y resultados de APIs externas (TTL 3h)
- Prisma: acceso a PostgreSQL
- node-cron: jobs de sincronización cada 4-6h
- APIs nativas por TCG: Scryfall, PokémonTCG API, YGOPRODeck, OPTCGAPI
- `POKEMON_TCG_API_KEY` es opcional pero mejora los rate limits

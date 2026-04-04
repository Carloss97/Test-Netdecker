# Funciones Importantes — Referencia Rápida

Este documento centraliza las funciones clave del sistema para no perderlas entre sprints.

---

## Frontend — `frontend/src/services/catalog.ts`

### Inventario y Stock

| Función | Descripción |
|---------|-------------|
| `getTCGs()` | Lista todos los TCGs registrados (MAGIC, POKEMON, YUGIOH, ONE_PIECE). |
| `getEditions({ tcgId?, activeOnly? })` | Lista ediciones/sets, filtradas por TCG si se pasa `tcgId`. |
| `getEditionCardsWithStock(editionId)` | Devuelve todas las cartas de una edición con sus listings (stock, precio, condición). |
| `batchUpdateStock(updates)` | Actualiza cantidades de múltiples listings en una sola petición. `updates = [{ listingId, quantity }]`. |
| `downloadEditionCsvTemplate(editionId)` | Descarga plantilla CSV pre-llenada para actualización masiva de una edición. |
| `importInventoryCsv(file)` | Importa un CSV de stock (upsert completo). |
| `validateInventoryCsv(file)` | Valida el CSV sin importar. Muestra errores por fila. |
| `getInventoryImports(params?)` | Historial de importaciones paginado. |
| `getLowStockListings(threshold?)` | Listings con stock ≤ umbral (default 2). Usado en alertas. |

### Búsqueda de Cartas

| Función | Descripción |
|---------|-------------|
| `searchCards(name, tcgId?, limit?)` | Busca cartas por nombre (match parcial, case-insensitive). |
| `searchCardsByCode(code, tcgId?, limit?)` | Busca cartas por código (match parcial). Devuelve todas las rarezas y ediciones que coincidan. |
| `getCardById(id)` | Detalle de una carta por su ID interno. |
| `getListingsByCard(cardId)` | Todos los listings (condiciones/rarezas) de una carta. |

### Precios

| Función | Descripción |
|---------|-------------|
| `syncListingPrices(updates?, roundingMultiple?, notes?)` | Dispara sincronización de precios desde APIs externas. |
| `getPriceSyncRuns(limit?)` | Historial de ejecuciones de sincronización de precios. |
| `getInventoryValue()` | Valor total del inventario en CLP. |
| `previewListingPrice(referencePrice, marginMultiplier, roundingMultiple?)` | Calcula precio final CLP sin guardar. |

### Catálogo Externo

| Función | Descripción |
|---------|-------------|
| `searchExternalCards(tcg, query, options?)` | Busca en APIs externas (Scryfall/PokémonTCG/YGOPRODeck/OPTCGAPI). |
| `listExternalSets(tcg)` | Lista sets disponibles en las APIs externas. |
| `importExternalCard(params)` | Importa una carta individual al catálogo local. |
| `importExternalSearch(params)` | Importa todos los resultados de una búsqueda. |
| `importExternalSet(params)` | Importa un set completo desde una API externa. |
| `bootstrapCatalog(params?)` | Bootstrap masivo de catálogo (útil en setup inicial). |
| `syncCatalog(params?)` | Sincroniza nuevos sets detectados en las APIs. |
| `resetCatalog()` | ⚠️ Borra todo el catálogo (cartas, ediciones, listings, historial). Preserva TCGs y tipos de cambio. |

---

## Backend — `backend/src/services/`

### CardService

| Método | Descripción |
|--------|-------------|
| `CardService.createCard(input)` | Crea una nueva carta. |
| `CardService.getCard(id)` | Obtiene carta por ID (incluye listings). |
| `CardService.searchByName(name, tcgId?, limit?)` | Búsqueda por nombre, case-insensitive (incluye edition). |
| `CardService.searchByCode(code, tcgId?, limit?)` | Búsqueda por código de carta, case-insensitive. Retorna todas las rarezas/ediciones. |
| `CardService.findCardByCode(tcgId, editionId, cardCode, rarity?)` | Busca carta por clave única compuesta. |
| `CardService.getCardsByEdition(editionId)` | Todas las cartas de una edición. |
| `CardService.getCardsByTCG(tcgIdentifier)` | Todas las cartas de un TCG (acepta ID o nombre como "POKEMON"). |
| `CardService.bulkUpsertCards(cards[])` | Upsert masivo desde CSV/import. |

### InventoryService

| Método | Descripción |
|--------|-------------|
| `InventoryService.importCsv(file, importedBy)` | Procesa CSV en modo upsert completo. |
| `InventoryService.validateCsv(file)` | Valida CSV y reporta errores por fila sin guardar. |
| `InventoryService.getImports(params)` | Historial de importaciones paginado y filtrable. |

### ListingService

| Método | Descripción |
|--------|-------------|
| `ListingService.getAvailableListings(tcgId?, editionId?)` | Listings con stock > 0. |
| `ListingService.getLowStockListings(threshold?)` | Listings con stock ≤ umbral. |
| `ListingService.getInventoryValue()` | Suma total de inventario en CLP. |
| `ListingService.batchUpdateStock(updates[])` | Actualización masiva de cantidades. |

### PriceService

| Método | Descripción |
|--------|-------------|
| `PriceService.updateListingPrice(listingId, newPrice, reason)` | Actualiza precio y crea registro histórico. |
| `PriceService.isVolatileChange(oldPrice, newPrice, threshold?)` | Detecta si el cambio de precio es sospechoso. |
| `PriceService.calculateFinalPrice(referenceUSD, margin, exchangeRate, rounding?)` | Fórmula: `referenceUSD × margin × exchangeRate`, redondeado. |

### ExchangeRateService

| Método | Descripción |
|--------|-------------|
| `ExchangeRateService.getRate()` | Obtiene tipo de cambio USD→CLP (desde caché Redis o API externa). |
| `ExchangeRateService.refresh()` | Fuerza actualización del tipo de cambio. |

---

## API Endpoints Clave

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `GET /api/cards/search?name=xxx` | GET | Buscar cartas por nombre |
| `GET /api/cards/search?code=xxx` | GET | Buscar cartas por código (todas las rarezas) |
| `GET /api/editions/:id/cards-with-stock` | GET | Cartas + listings de una edición (para inventario) |
| `POST /api/listings/batch-stock` | POST | Actualización masiva de stock |
| `POST /api/inventory/import-csv` | POST | Importar CSV de inventario |
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

- **Redis** se usa para cachear el tipo de cambio (TTL variable) y resultados de APIs externas (TTL 3h).
- **Prisma** gestiona todos los accesos a PostgreSQL.
- Los jobs de sincronización se ejecutan con `node-cron` cada 4-6 horas.
- El catálogo usa las APIs nativas por TCG: Scryfall (Magic), PokémonTCG API (Pokémon), YGOPRODeck (Yu-Gi-Oh), OPTCGAPI (One Piece).
- `POKEMON_TCG_API_KEY` es opcional pero mejora los rate limits.

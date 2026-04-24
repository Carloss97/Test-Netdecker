# TCGCSV Integration Analysis Report

## Executive Summary

TCGCSV (https://tcgcsv.com) is a **primary data source** for the application, providing free access to TCGplayer data for **MAGIC, POKEMON, YUGIOH, ONE_PIECE, DIGIMON, and WEISS_SCHWARZ** card games. The integration is **deeply embedded** in the pricing and catalog synchronization workflows, with strategic caching applied to minimize API calls.

---

## 1. TCG Support & Category Mappings

The service supports 6 TCG types with official TCGplayer category IDs:

```typescript
TCGCSV_CATEGORY_IDS: {
  MAGIC: 1,
  POKEMON: 3,
  YUGIOH: 2,
  ONE_PIECE: 68,
  DIGIMON: 63,
  WEISS_SCHWARZ: 20,
}
```

**Note:** Historical mappings included `WEISS_SCHWARZ: 6`, but current mapping is `20`.

---

## 2. Core API Methods in TCGCsvService

### **API Endpoints Called**

| Method | Endpoint | Purpose | Caching |
|--------|----------|---------|---------|
| `getGroups()` | `/{categoryId}/groups` | Fetch all sets/editions per TCG | 3-hour Redis cache |
| `getGroupProducts()` | `/{categoryId}/{groupId}/products` | Fetch all cards in a set | 3-hour Redis cache |
| `getGroupPrices()` | `/{categoryId}/{groupId}/prices` | Fetch price data per set | 3-hour Redis cache |
| `getSetCards()` | Both above combined | Get cards + prices for a set | 3-hour Redis cache |
| `listSets()` | `/groups` endpoint | List all sets (high-level) | 3-hour Redis cache |
| `getSetCardCount()` | Products endpoint | Count cards in a set (lightweight) | 3-hour Redis cache |
| `searchCards()` | Scans all groups | Global search across all sets | 3-hour Redis cache |
| `getCardById()` | Scans groups for product | Lookup single card by external ID | 3-hour Redis cache |
| `getProductPrices()` | Scans group prices | Get all price variants for a product | 3-hour Redis cache |
| `getBestPriceForProduct()` | Derived from above | Single market price for a product | Derived from cache |

### **Request Throttling & Rate Limiting**

- **Min delay between requests:** 450ms (polite throttle)
- **Request timeout:** 20 seconds
- **Max retries:** 4 attempts
- **Exponential backoff:** 429/503/504 errors trigger exponential backoff (600ms × 2^attempt)
- **Jitter:** Random 0-250ms added to each retry
- **User-Agent:** Configurable via `TCGCSV_USER_AGENT` env var (default: `Mozilla/5.0 (compatible; TCG-ERP/1.0)`)

### **Error Handling**

- On fatal error (status != 429/503/504 after max retries): Logs full error context including status, headers, and response body snippet
- On retryable error: Exponential backoff with jitter; continues transparently
- On cache miss: Returns empty array with 60-second negative TTL cache
- **No exception thrown to caller** — all errors degrade gracefully to empty results

---

## 3. Data Flow: Price Synchronization

### **Scheduled Cron Job**

**Trigger:** `PriceSyncJob` starts on server boot

```typescript
const schedule = process.env.PRICE_SYNC_CRON || '0 */6 * * *'; // Every 6 hours by default
```

**Dev-safe mode** (default in development):
- `inventoryOnly=true` — only syncs listings with stock
- `fetchExternalPrices=false` — skips external API calls (uses stored/fallback prices)

**Production mode:**
- Fetches latest prices from external sources
- Updates **all** active listings

### **Pricing Logic: Set-Snapshot Optimization**

When running `runPriceSync()`:

1. **Grouping:** All cards are grouped by `{TCG_NAME}|{EDITION_CODE}`
2. **Per-group call:** For each unique (TCG, Edition) pair, call `CardDatabaseService.getSetCards(tcg, editionCode)` once
3. **Price building:** For each card in the group:
   - Look up price by `externalId` (productId)
   - Fallback to price lookup by `cardName` (case-insensitive)
   - Rank prices: `Normal > Holofoil > Reverse Holofoil > Others`
   - Choose best: `marketPrice > midPrice > lowPrice`
4. **Priority order:**
   - API price (if available) → source: "api"
   - Stored reference price (if valid) → source: "stored"
   - Fallback estimate → source: "fallback"

**Rate limiting between sets:**

```typescript
const SET_SYNC_DELAY_MS: Record<SyncTcgName, number> = {
  MAGIC: 550,
  POKEMON: 120,
  YUGIOH: 60,
  ONE_PIECE: 350,
  DIGIMON: 200,
  WEISS_SCHWARZ: 200,
};
```

---

## 4. Data Flow: Catalog Synchronization

### **Scheduled Cron Job**

**Trigger:** `CatalogSyncJob` starts on server boot

```typescript
const schedule = process.env.CATALOG_SYNC_CRON || '0 3 * * *'; // Daily at 3 AM
```

### **Process**

1. **List all external sets:** Call `TCGCsvService.listSets(tcg)` per TCG
2. **Compare with local:** Check if `Edition` record exists locally (by `editionCode`)
3. **New sets:** Call `ExternalImportService.importSet()` for each new set:
   - Bulk import all cards from TCGCSV
   - Optionally create listings with initial quantity = 0
   - Optional: trigger price sync for the imported set
4. **Updated sets:** Update `Edition.editionName`, `releaseDate`, `isActive`
5. **Rate limiting:** 500ms delay between set imports (to avoid overwhelming external APIs)

### **API Calls Count**

For a typical sync:
- **1 call** per TCG: `getGroups()`
- **N calls**: `getGroupProducts()` for each new set
- **N calls**: `getGroupPrices()` for each new set
- **Total: ~2N+1 calls** for N new sets per TCG

---

## 5. Data Flow: External Import & Search

### **Manual Import Routes**

**GET /api/external/search**
- Calls `CardDatabaseService.searchCards()` which delegates to `TCGCsvService.searchCards()`
- Scans **all groups** in a TCG, filters by name
- Returns up to 50 unique results
- Cache: 3 hours per query

**GET /api/external/sets**
- Calls `TCGCsvService.listSets()`
- Optional: `?includeCardCounts=true` triggers `getSetCardCount()` for each set (expensive!)
- Default: no card counts (keeps response light)

**GET /api/external/cards/:tcg/:cardId**
- Calls `TCGCsvService.getCardById()`
- Scans all groups to find the product
- Includes price data

**POST /api/external/import/card**
- Fetch card from external DB
- Import into local database (upsert)
- Create listing if requested

**POST /api/external/import/search**
- Search external DB
- Bulk import all matching cards

---

## 6. Caching Strategy

### **Cache Layer: Redis**

All TCGCSV API responses cached via `cacheGet()` / `cacheSet()`:

**Cache Keys:**
```
tcgcsv:groups:{categoryId}
tcgcsv:products:{categoryId}:{groupId}
tcgcsv:prices:{categoryId}:{groupId}
tcgcsv:set-cards:{categoryId}:{setCode}
tcgcsv:set-card-count:{categoryId}:{setCode}
tcgcsv:search:{categoryId}:{query}
tcgcsv:card:{categoryId}:{productId}
tcgcsv:product-prices:{categoryId}:{productId}
```

**TTL:** 3 hours (10,800 seconds) for all successful responses
**Negative TTL:** 60 seconds for failed/empty responses
**Timeout behavior:** Code tolerates cache misses gracefully

### **In-Memory Throttle**

Private static variable in `TCGCsvService`:
```typescript
private static readonly MIN_REQUEST_DELAY_MS = 450;
private static lastRequestAt = 0;
```

---

## 7. Entry Points & Integration

### **Via CardDatabaseService (Unified Facade)**

**TCGCsvService is the default provider for:**
- `DIGIMON` (no native API)
- `WEISS_SCHWARZ` (no native API)
- Primary source for all supported TCGs in this project

### **Service Composition**

```
CardDatabaseService (unified facade)
  ↓
  └─→ TCGCsvService (all supported TCGs)
```

### **Consumers**

1. **PriceSyncService.runPriceSync()** — fetches `getSetCards()` per imported edition
2. **CatalogSyncService.syncNewSets()** — fetches `listSets()` and `getSetCards()` per new set
3. **ExternalImportService** — uses `CardDatabaseService` methods
4. **Admin routes** (`/api/external/search`, `/api/external/sets`, etc.)

---

## 8. Performance Characteristics

### **API Calls During Typical Operations**

| Operation | Calls | Time | Bottleneck |
|-----------|-------|------|------------|
| Price sync (10 sets) | ~20-30 | 5-10 min | SET_SYNC_DELAY_MS throttle + 450ms/req |
| Catalog sync (5 new sets) | ~10-15 | 2-5 min | SET_SYNC_DELAY_MS throttle + import logic |
| Search (1 query) | ~6-12 | 3-5 sec | Scans all groups (cached after first) |
| Set card count (1 set) | 1 | 500ms | Single getGroupProducts call |
| Single card lookup | ~6-12 | 1-3 sec | Scans all groups sequentially |

### **Cache Hit Rates**

- **First run:** 0% hit rate; all API calls made
- **Subsequent runs (within 3 hours):** ~95%+ hit rate (all calls cached)
- **Cache expiry (3-hour window):** Automatic refresh on next scheduled job

---

## 9. Identified Bottlenecks & Inefficiencies

### **1. Sequential Group Scanning (Medium Priority)**

**Issue:** `searchCards()`, `getCardById()`, and `getProductPrices()` scan groups sequentially
```typescript
for (const group of groups) {
  const products = await this.getGroupProducts(...);  // Sequential await
  ...
}
```

**Impact:** If a card is in the last group, all previous groups scanned sequentially
**Mitigation:** Cache after first hit; most TCGs have <100 groups
**Solution:** Could parallelize group scans with concurrency limit

### **2. Heavy `/external/sets?includeCardCounts=true`**

**Issue:** Without caching, each call to `getSetCardCount()` makes 1 API call
```
1 call per set → N calls for N sets (e.g., POKEMON has 30+ sets)
```

**Mitigation:** Default is `false` (no card counts); explicit `includeCardCounts=true` is rare
**Solution:** Cache set metadata (totalCards) from initial `getGroups()` response

### **3. Price Sync Rate Limiting (Low Priority but observable)**

**Issue:** `SET_SYNC_DELAY_MS` adds 60-550ms delay **per set** between calls
- MAGIC: 550ms × N sets
- Example: 20 sets × 550ms = 11 seconds just in delays

**Mitigation:** Delays are intentional (polite rate-limiting for free API)
**Solution:** Could batch group products/prices calls (if TCGCSV API supports bulk)

### **4. Price Selection Logic (Low Impact)**

**Issue:** `pickBestPrice()` builds a Map and sorts all prices for each product
- For products with 5+ foil variants, creates Map, filters, sorts
- Repeated for each product in a set (~200+ products)

**Impact:** Negligible (<1% of total sync time)
**Solution:** Pre-sort in cache layer (unlikely needed)

### **5. No Secondary Provider Strategy**

**Current policy:** If TCGCSV API is down, imports depending on external catalog/pricing data are unavailable.

**Decision:** Keep TCGCSV as single source of truth to simplify operations and avoid cross-provider divergence.

---

## 10. Error Handling Patterns

### **Current Approach**

1. **Silent degrades:** All errors caught; returns empty array or null
2. **Retry-able errors:** 429/503/504 trigger exponential backoff
3. **Non-retryable errors:** Logged with full context; returns empty
4. **No exceptions:** Callers never see exceptions from TCGCSV API

### **Logging**

```typescript
console.error(`[TCGCsvService] request failed for ${url} status=${status} ...`);
console.warn(`[TCGCsvService] getSetCards: set "${setCode}" not found for ${tcg}`);
console.info(`[TCGCsvService] Set-snapshot optimization used: ${grouped.size} set calls`);
```

### **Recovery Strategies**

- **On API failure:** Uses stored/fallback prices (PriceSync)
- **On import failure:** Skips card, logs error, continues with next
- **On cache timeout:** Retries external API

---

## 11. Configuration via Environment Variables

```bash
# TCGCSV Service
TCGCSV_BASE=https://tcgcsv.com/tcgplayer          # API base URL
TCGCSV_USER_AGENT=Mozilla/5.0 (custom)            # User-Agent header

# Sync Job Schedules
PRICE_SYNC_CRON='0 */6 * * *'                     # Every 6 hours
CATALOG_SYNC_CRON='0 3 * * *'                     # Daily at 3 AM
PRICE_SYNC_ENABLED=true                            # Enable/disable price sync
CATALOG_SYNC_ENABLED=true                          # Enable/disable catalog sync
PRICE_SYNC_DEV_SAFE_MODE=true                      # Dev-only: skip external calls

# Feature Flags
USE_D1=false                                        # Use D1 backend variant (Cloudflare Workers)
```

---

## 12. Summary of All API Calls

### **Count Estimation (Per Full Sync Cycle)**

Assuming:
- 6 TCGs with ~20-40 sets each
- ~4,000 total imported cards
- Weekly full sync

**Per-week API calls to TCGCSV:**
- Price sync job: ~240 calls (6 TCGs × avg 40 sets, called twice daily)
- Catalog sync job: ~60 calls (scanning + importing new sets)
- Manual searches/imports: ~20-50 calls (estimated)
- **Total: ~300-350 calls/week**

**Cache efficiency:** ~95% hit rate during same-day repeated calls

---

## 13. Legacy Code (Deprecated)

Located in: `legacy/functions_disabled/_shared/tcgcsv.js`

- **Status:** Disabled, not used in current backend
- **Note:** In-memory cache (globalThis) instead of Redis
- **Reason for replacement:** Transitioned to Redis-backed caching for distributed deployments

---

## 14. Known Issues & Pending Improvements

From project documentation:
1. **Fallback strategy:** No secondary provider for DIGIMON/WEISS_SCHWARZ
2. **Group scanning:** Sequential rather than parallel (could be optimized)
3. **Set metadata caching:** Card counts not cached from initial `getGroups()` call
4. **No bulk API endpoint:** TCGCSV doesn't support fetching multiple sets in one call

---

## 15. Recommendations

| Priority | Issue | Solution |
|----------|-------|----------|
| **HIGH** | Fallback provider for DIGIMON/WEISS | Add fallback logic if TCGCSV fails |
| **MEDIUM** | Group scanning is sequential | Parallelize with concurrency control |
| **MEDIUM** | Price sync delays observable | Evaluate if rate-limiting can be reduced |
| **LOW** | Heavy `includeCardCounts` | Cache card counts from `getGroups()` |
| **LOW** | Error context logging | Structured JSON logging for analytics |

---

**Document generated:** 2026-04-22  
**Analysis scope:** Full backend TCGCSV integration  
**Version:** Current main branch (TCGCsvService.ts, PriceSyncService.ts, CatalogSyncService.ts, CardDatabaseService.ts)

# 🔐 Multi-Tenant Testing Guide

## Quick Setup

### 1. Create Test Admin Account

```bash
# First, get an API key to create the admin (via curl or Postman)
# POST /api/admin/auth/create
curl -X POST http://localhost:3333/api/admin/auth/create \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-bootstrap-api-key" \
  -d '{
    "email": "admin@test.com",
    "password": "Admin123!",
    "role": "ADMIN"
  }'

# Response will show if successful
```

### 2. Get Stores in Your System

```bash
# First login
curl -X POST http://localhost:3333/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@test.com",
    "password": "Admin123!",
    "storeId": "any-store-uuid-or-null"
  }'

# Save the token from response

# Then list your stores
curl -X GET http://localhost:3333/api/admin/stores \
  -H "x-admin-token: YOUR_TOKEN_HERE"
```

---

## 🧪 Test Scenarios

### Scenario A: Admin Dashboard (Viewing All Stores' Data)

**Goal:** As an admin, see price volatility across all your stores.

```bash
# 1. Authenticate as admin
ADMIN_TOKEN=$(curl -s -X POST http://localhost:3333/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@test.com",
    "password": "Admin123!",
    "storeId": "store-uuid-1"
  }' | jq -r '.data.token')

echo "Admin Token: $ADMIN_TOKEN"

# 2. View price volatility (should show data from all your stores)
curl -X GET "http://localhost:3333/api/admin/price-volatility?limit=20&window=7d" \
  -H "x-admin-token: $ADMIN_TOKEN"

# Expected response:
# {
#   "success": true,
#   "window": "7d",
#   "total": 5,
#   "events": [
#     {
#       "priceHistoryId": "...",
#       "listingId": "...",
#       "cardName": "Lightning Bolt",
#       "editionCode": "LEA",
#       "oldPrice": 5000,
#       "newPrice": 5500,
#       "percentChange": 10,
#       "createdAt": "2026-04-23T..."
#     }
#   ]
# }
```

**If you get P2032 error:**
- This means a priceHistory entry references a listing that doesn't exist
- DB has orphaned data
- Check: `SELECT COUNT(*) FROM "PriceHistory" WHERE "listingId" NOT IN (SELECT id FROM "Listing");`

**If you get 401 error:**
- Your admin token expired
- Pass the correct `x-admin-token` header
- Verify token in database: `SELECT * FROM "AdminSession" WHERE token = 'your-token';`

---

### Scenario B: Store A Viewing Its Own Stock

**Goal:** Store A (tenant) sees only its own listings.

```bash
# Option 1: Using Store UUID (direct access)
curl -X GET "http://localhost:3333/api/listings/available?tcgId=MTG" \
  -H "x-store-id: store-uuid-a"

# Expected response: Only Store A's listings with MTG cards

# Option 2: Using Store API Key (if configured)
curl -X GET "http://localhost:3333/api/listings/available?tcgId=MTG" \
  -H "Authorization: Bearer store-api-key-a"

# Option 3: Without Store Context (Public, see all stores)
curl -X GET "http://localhost:3333/api/listings/available?tcgId=MTG"

# Expected response: All listings from all stores
```

**If you get 401 on `/api/listings/low-stock`:**
- This endpoint REQUIRES a store context (x-store-id or token)
- Add the header and retry

**If you get 404 on `/api/editions/:id/cards-with-stock`:**
- This endpoint tries to auto-create listings for the current store
- If no store is found, it now returns empty listings (fixed behavior)
- Add `x-store-id` header to see that store's stock

---

### Scenario C: Store B with Different Stock

**Goal:** Show that Store B has independent inventory from Store A.

```bash
# Store B views its MTG cards
curl -X GET "http://localhost:3333/api/listings/available?tcgId=MTG" \
  -H "x-store-id: store-uuid-b"

# Expected: Different listings, different quantities, different prices
# (Example: Store A has 5x Lightning Bolt @ 5000 CLP, Store B has 3x @ 5500 CLP)
```

**Key insight:** Even though both stores have the same "Lightning Bolt" card (Edition is global), they each:
- Have their own inventory count
- Have their own prices
- Have their own price history

---

## 🐛 Debugging Errors

### Error: 401 "Tenant not found or missing credentials"

**Where it happens:**
- `/api/listings/low-stock` without `x-store-id`
- `/api/inventory/value` without `x-store-id`
- `/api/listings/:id` (get specific listing) without `x-store-id`

**Fix:** Add the store header:
```bash
curl -X GET http://localhost:3333/api/listings/low-stock \
  -H "x-store-id: your-store-uuid"
```

---

### Error: 500 P2032 "Internal Server Error"

**Root cause:** Orphaned data in Prisma queries (a record references a non-existent relation).

**Example:** A `PriceHistory` entry references a `Listing` that was deleted.

**Fix:**
1. Check database consistency:
```sql
-- Orphaned price history
SELECT COUNT(*) FROM "PriceHistory" WHERE "listingId" NOT IN (SELECT id FROM "Listing");

-- Orphaned listings (unlikely, but check anyway)
SELECT COUNT(*) FROM "Listing" WHERE "cardId" NOT IN (SELECT id FROM "Card");
SELECT COUNT(*) FROM "Listing" WHERE "storeId" NOT IN (SELECT id FROM "Store");
```

2. If orphans exist, delete them:
```sql
-- ⚠️ DANGEROUS! Backup first!
DELETE FROM "PriceHistory" WHERE "listingId" NOT IN (SELECT id FROM "Listing");
```

3. Retry the request.

---

### Error: 404 "Not Found" or Missing Listings

**Possible causes:**

1. **No store exists yet**
   ```bash
   # Check if stores exist
   curl -X GET http://localhost:3333/api/admin/stores \
     -H "x-admin-token: your-token"
   ```

2. **Listings created but not indexed**
   - Listings are auto-created when you import TCG cards
   - Check: `SELECT COUNT(*) FROM "Listing" WHERE "storeId" = 'your-store-uuid';`

3. **Using wrong TCG filter**
   ```bash
   # Available TCGs: MTG, POKEMON, YUGIOH
   curl -X GET "http://localhost:3333/api/listings/available?tcgId=POKEMON"
   ```

4. **Wrong endpoint path**
   - Use `/api/listings/available` (public, lists multiple stores)
   - Not `/api/listings/:id` (specific listing, requires store context)

---

## 📊 API Endpoint Cheat Sheet

| Endpoint | Auth Required? | Headers | What It Does |
|----------|---|----------|--------|
| `POST /api/admin/auth/login` | API Key | `x-api-key` | Get admin token |
| `GET /api/admin/stores` | Admin Token | `x-admin-token` | See all your stores |
| `GET /api/admin/price-volatility` | Admin Token | `x-admin-token` | View price changes across stores |
| `GET /api/listings/available` | ❌ NO | (Optional) `x-store-id` | List all available cards (public) |
| `GET /api/listings/low-stock` | Store ID | `x-store-id` | Low-stock alerts for THIS store |
| `GET /api/inventory/value` | Store ID | `x-store-id` | Inventory value for THIS store |
| `GET /api/editions/:id/cards-with-stock` | ❌ NO | (Optional) `x-store-id` | Cards in an edition |
| `PATCH /api/listings/:id/pricing-mode` | Store ID | `x-store-id` | Change pricing mode (manual/api) |

---

## 🎯 Common Workflows

### Workflow: Admin Reviews Price Changes Across All Stores

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:3333/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@test.com",
    "password": "Admin123!",
    "storeId": null
  }' | jq -r '.data.token')

# 2. View volatile prices (last 7 days)
curl -X GET "http://localhost:3333/api/admin/price-volatility?limit=50&window=7d" \
  -H "x-admin-token: $TOKEN" | jq '.events[] | "\(.cardName) in \(.editionCode): \(.oldPrice) -> \(.newPrice) (\(.percentChange)%)"'

# 3. Identify which store has the change
# (Note: Current API doesn't show store name, but you can join with your Store list)
```

### Workflow: Store Manager Views Their Inventory

```bash
STORE_ID="your-store-uuid"

# 1. See available cards
curl -X GET "http://localhost:3333/api/listings/available?tcgId=MTG" \
  -H "x-store-id: $STORE_ID"

# 2. See low-stock alerts
curl -X GET "http://localhost:3333/api/listings/low-stock?tcgId=MTG" \
  -H "x-store-id: $STORE_ID"

# 3. See total inventory value
curl -X GET "http://localhost:3333/api/inventory/value" \
  -H "x-store-id: $STORE_ID"

# 4. Manually adjust price for a card
curl -X PATCH "http://localhost:3333/api/listings/listing-uuid/pricing-mode" \
  -H "x-store-id: $STORE_ID" \
  -H "Content-Type: application/json" \
  -d '{"mode": "MANUAL", "customPrice": 7500}'
```

---

## 🔑 Key Takeaways

1. **Admin token** (`x-admin-token`) = See all stores
2. **Store ID** (`x-store-id`) = See only that store's data
3. **Editions are global** = All stores see the same card definitions
4. **Listings are per-store** = Each store has independent stock & prices
5. **Public endpoints** = Don't require auth, but can be filtered by store
6. **Protected endpoints** = Require either admin token or store ID

---

## Next Steps

1. Create your test stores (if they don't exist)
2. Run the above curl commands to verify each scenario
3. If you hit errors, use the debugging section above
4. If DB is corrupted, we can clean it up (tell me)

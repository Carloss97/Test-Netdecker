# 🏗️ Arquitectura Multi-Tenant: Diagrama Visual

## 📐 Vista General de la App

```
┌─────────────────────────────────────────────────────────────────┐
│                     TU APLICACIÓN                               │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐    │
│  │           BASE DE DATOS COMPARTIDA                     │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐   │    │
│  │  │   Card       │  │  Edition     │  │   Store    │   │    │
│  │  │  (Global)    │  │  (Global)    │  │ (Tenant A) │   │    │
│  │  │              │  │              │  └────────────┘   │    │
│  │  ├──────────────┤  │              │  ┌────────────┐   │    │
│  │  │ - cardCode   │  └──────────────┘  │ (Tenant B) │   │    │
│  │  │ - cardName   │  ┌──────────────┐  │            │   │    │
│  │  │ - tcgId      │  │   Listing    │  └────────────┘   │    │
│  │  │              │  │  (Per-Store) │                   │    │
│  │  └──────────────┘  │              │  ┌────────────┐   │    │
│  │                    │ - cardId     │  │ (Tenant C) │   │    │
│  │                    │ - storeId    │  │            │   │    │
│  │                    │ - quantity   │  └────────────┘   │    │
│  │                    │ - price      │                   │    │
│  │                    └──────────────┘                   │    │
│  │                                                       │    │
│  │  ┌──────────────────┐  ┌──────────────────┐          │    │
│  │  │   PriceHistory   │  │   AdminSession   │          │    │
│  │  │  (Per-Listing)   │  │   (Per-Admin)    │          │    │
│  │  │                  │  │                  │          │    │
│  │  │ - listingId      │  │ - email          │          │    │
│  │  │ - oldPrice       │  │ - token          │          │    │
│  │  │ - newPrice       │  │ - storeId        │          │    │
│  │  │ - reason         │  │ - expiresAt      │          │    │
│  │  └──────────────────┘  └──────────────────┘          │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐    │
│  │              API ROUTES                               │    │
│  │                                                        │    │
│  │  ┌────────────────────┐  ┌─────────────────────────┐ │    │
│  │  │ /api/admin/*       │  │ /api/listings/*         │ │    │
│  │  │ (Admin Dashboard)  │  │ (Public & Store-Scoped) │ │    │
│  │  │                    │  │                         │ │    │
│  │  │ ✓ price-volatility │  │ ✓ /available (public)   │ │    │
│  │  │ ✓ stores           │  │ ✓ /low-stock (store)    │ │    │
│  │  │ ✓ kpis             │  │ ✓ /:id (store)          │ │    │
│  │  └────────────────────┘  └─────────────────────────┘ │    │
│  │                                                        │    │
│  │  ┌──────────────────┐  ┌──────────────────────────┐   │    │
│  │  │ /api/editions/*  │  │ /api/inventory/*         │   │    │
│  │  │ (Public)         │  │ (Store-Scoped)           │   │    │
│  │  │                  │  │                          │   │    │
│  │  │ ✓ /:id/cards     │  │ ✓ /value (store)         │   │    │
│  │  │ ✓ public         │  │                          │   │    │
│  │  └──────────────────┘  └──────────────────────────┘   │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Flujo de Autenticación: Admin

```
┌──────────────────┐
│  Admin User      │
│                  │
│ email: admin...  │
│ password: ****   │
└────────┬─────────┘
         │
         │ POST /api/admin/auth/login
         │ + storeId (opcional)
         ▼
┌────────────────────────────────┐
│  AdminAuthService.authenticate │
│                                │
│  ✓ Valida email/password       │
│  ✓ Crea AdminSession en BD     │
│  ✓ Devuelve token + expiresAt  │
└────────┬───────────────────────┘
         │
         │ Response: { token, expiresAt }
         ▼
┌──────────────────┐
│  Frontend/Client │
│                  │
│  Guarda token    │
│  (cookie/header) │
└────────┬─────────┘
         │
         │ Siguiente request
         │ Header: x-admin-token: {token}
         │
         ▼
┌────────────────────────────────┐
│  tenantResolver middleware     │
│                                │
│  ✓ Extrae token de header      │
│  ✓ Busca AdminSession en BD    │
│  ✓ Valida que no expiró        │
│  ✓ Resuelve req.store = {...}  │
└────────┬───────────────────────┘
         │
         ▼
┌────────────────────────────────┐
│  requireAdmin middleware        │
│                                │
│  ✓ Verifica req.store existe   │
│  ✓ Verifica roles/permisos     │
│  ✓ Permite acceso a /api/admin │
└────────┬───────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│  Route Handler                   │
│  (ej: /api/admin/price-volatility)
│                                  │
│  ✓ Ve datos de TODAS las tiendas │
│  del admin autenticado           │
└──────────────────────────────────┘
```

---

## 🏪 Flujo de Autenticación: Store (Tenant)

```
┌──────────────────────┐
│  Store Manager       │
│                      │
│  (No login directo)  │
│  Usa UUID de tienda  │
└────────┬─────────────┘
         │
         │ Request con header
         │ x-store-id: {store-uuid}
         │
         ▼
┌────────────────────────────────┐
│  tenantResolver middleware     │
│                                │
│  ✓ Busca header x-store-id     │
│  ✓ Valida Store en BD          │
│  ✓ Resuelve req.store = {...}  │
└────────┬───────────────────────┘
         │
         ▼
┌────────────────────────────────┐
│  Route Handler                 │
│  (ej: /api/listings/available) │
│                                │
│  ✓ Si requiere store:          │
│    - Chequea req.store existe  │
│    - Filtra datos por storeId  │
│  ✓ Si es público:              │
│    - Devuelve datos globales   │
│    o filtra si store presente  │
└────────────────────────────────┘
```

---

## 📊 Comparación: Admin vs Store

### Admin Autenticado

```
┌─────────────────────────────────────────────────┐
│  Admin Token válido                             │
│  x-admin-token: eyJhbGc...                     │
└──────┬──────────────────────────────────────────┘
       │
       ▼ tenantResolver
       
req.store = {
  id: "store-uuid-1",    ← Store del admin
  slug: "tienda-principal",
  name: "Tienda Principal"
}

       │
       ▼ Acceso a /api/admin/*
       
┌─────────────────────────────────────────────────┐
│ GET /api/admin/price-volatility                │
│                                                │
│ VE: Cambios de precio de TODAS las tiendas    │
│ (donde el admin tiene acceso)                  │
│                                                │
│ Response: [                                    │
│   {                                            │
│     cardName: "Lightning Bolt",               │
│     editionCode: "LEA",                       │
│     oldPrice: 5000,                          │
│     newPrice: 5500,                          │
│     createdAt: "2026-04-23T..."              │
│   },                                          │
│   ...                                        │
│ ]                                            │
└─────────────────────────────────────────────────┘
```

### Store Identificada por UUID

```
┌─────────────────────────────────────────────────┐
│  Sin autenticación especial                     │
│  x-store-id: store-uuid-a                      │
└──────┬──────────────────────────────────────────┘
       │
       ▼ tenantResolver
       
req.store = {
  id: "store-uuid-a",    ← Store especificada
  slug: "tienda-a",
  name: "Tienda A"
}

       │
       ▼ Acceso a /api/listings/* (con protección)
       
┌─────────────────────────────────────────────────┐
│ GET /api/listings/low-stock (con x-store-id)   │
│                                                │
│ VE: Stock bajo SOLO de Tienda A               │
│                                                │
│ Response: [                                    │
│   {                                            │
│     id: "listing-uuid-1",                     │
│     cardName: "Lightning Bolt",               │
│     quantity: 2,         ← Tienda A tiene 2   │
│     ...                                       │
│   },                                          │
│   ...                                        │
│ ]                                            │
└─────────────────────────────────────────────────┘

       ▼

┌─────────────────────────────────────────────────┐
│ OTRA tienda (Store B) con x-store-id B         │
│                                                │
│ VE: Stock bajo SOLO de Tienda B               │
│                                                │
│ Response: [                                    │
│   {                                            │
│     id: "listing-uuid-2",  ← Diferente        │
│     cardName: "Lightning Bolt",                │
│     quantity: 5,         ← Tienda B tiene 5   │
│     ...                                       │
│   },                                          │
│   ...                                        │
│ ]                                            │
└─────────────────────────────────────────────────┘
```

---

## 🎯 Quién Ve Qué

### Editios & Cards (GLOBAL)

```
┌─────────────────────────────────────┐
│  Card: Lightning Bolt               │
│  Edition: Limited Edition (LEA)     │
│  TCG: MTG                           │
│                                     │
│  ✓ Todos los stores la ven          │
│  ✓ No es duplicada por store        │
│  ✓ Es la misma para todos           │
└─────────────────────────────────────┘
```

### Listings (PER-STORE, INDEPENDIENTE)

```
┌───────────────────────────────────────────────────┐
│  Listing A: Lightning Bolt (LEA) en Tienda A     │
│  - Quantity: 5                                   │
│  - Price: 5000 CLP                              │
│  - LastSyncedAt: 2026-04-23T...                 │
│                                                 │
│  Listing B: Lightning Bolt (LEA) en Tienda B   │
│  - Quantity: 3                                  │
│  - Price: 5500 CLP  ← DIFERENTE                │
│  - LastSyncedAt: 2026-04-22T... ← DIFERENTE   │
│                                                │
│  Listing C: Lightning Bolt (LEA) en Tienda C   │
│  - Quantity: 0 (AGOTADO)                       │
│  - Price: 5000 CLP                             │
└───────────────────────────────────────────────────┘

Cada tienda GESTIONA SU PROPIO STOCK
```

### Price History (PER-LISTING)

```
┌──────────────────────────────────────────────────┐
│  PriceHistory 1                                  │
│  Listing: Lightning Bolt en Tienda A            │
│  5000 → 5500 CLP (10% cambio)                  │
│  Reason: VOLATILE_ALERT                         │
│  CreatedAt: 2026-04-23T...                     │
│                                                 │
│  PriceHistory 2                                 │
│  Listing: Lightning Bolt en Tienda B            │
│  5400 → 5500 CLP (1.9% cambio)                │
│  Reason: API_SYNC                              │
│  CreatedAt: 2026-04-23T...                     │
│                                                 │
│  PriceHistory 3                                 │
│  Listing: Lightning Bolt en Tienda C            │
│  (No history, siempre ha sido 5000)            │
└──────────────────────────────────────────────────┘

Cada tienda tiene su HISTORIAL DE PRECIOS
```

---

## ❌ Qué Sale Mal (y Por Qué)

### Error: 401 "Tenant not found"

```
Request 1:
GET /api/listings/low-stock
(sin headers)
     │
     ▼
tenantResolver
❌ No encuentra store en: x-store-id, x-api-key, token
     │
     ▼
req.store = undefined
     │
     ▼
Ruta necesita store
requireStore() lanza:
❌ 401 "Tenant not found or missing credentials"
```

**Solución:**
```bash
GET /api/listings/low-stock
Header: x-store-id: store-uuid-a
     │
     ▼
✓ 200 OK, devuelve stock bajo de Tienda A
```

---

### Error: 500 P2032 "Internal Server Error"

```
GET /api/admin/price-volatility
     │
     ▼
Busca: PriceHistory (donde reason = 'VOLATILE_ALERT')
     │
     ▼
Intenta hacer include para obtener card, edition
     │
     ▼
FALLA: Listing #123 no existe
(PriceHistory referencia a un listingId que fue borrado)
     │
     ▼
❌ 500 P2032 "Internal Server Error"
```

**Solución actual:** (Ya implementada)
```
Primero: Obtén priceHistories (select solo campos)
Segundo: Obtén listings por separado
Tercero: Join en memoria, con fallback a "Unknown"
     │
     ▼
✓ 200 OK, devuelve datos con "Unknown" donde falten relaciones
```

---

### Error: 404 "Listings not found"

```
GET /api/listings/available?tcgId=MTG
     │
     ▼
ListingService.getAvailableListings()
     │
     ▼
SELECT * FROM Listing WHERE status = 'ACTIVE' AND quantity > 0
     │
     ▼
❌ Resultado vacío
    (No hay listings en la BD para MTG)
     │
     ▼
❌ 404 "No available listings"
```

**Causa probable:**
- No has importado cartas
- Las cartas se importaron pero sin crear listings
- Los listings están con quantity = 0

**Solución:**
1. Verifica que existan cards:
   ```sql
   SELECT COUNT(*) FROM "Card" WHERE tcgId = 'MTG';
   ```

2. Verifica que existan listings:
   ```sql
   SELECT COUNT(*) FROM "Listing" 
   WHERE "storeId" = 'your-store-uuid' AND status = 'ACTIVE';
   ```

3. Si no hay listings, importa cartas y crea listings manualmente o vía API

---

## 🔍 Debugging Checklist

### Paso 1: ¿Tienes tokens/headers válidos?

```bash
# Admin token
curl -X GET http://localhost:3333/api/admin/stores \
  -H "x-admin-token: your-token"
# Si 401: Token expiró o es inválido
# Si 200: Token válido, tienes acceso a admin

# Store ID
curl -X GET "http://localhost:3333/api/listings/available?tcgId=MTG" \
  -H "x-store-id: your-store-uuid"
# Si 200: Store existe y es accesible
# Si 401: Store no existe o no es válido
```

### Paso 2: ¿Existen los datos?

```bash
# BD: Verifica stores
SELECT id, slug, name FROM "Store";

# BD: Verifica listings
SELECT COUNT(*) FROM "Listing" WHERE "storeId" = '...';

# BD: Verifica cards
SELECT COUNT(*) FROM "Card" WHERE tcgId = 'MTG';
```

### Paso 3: ¿Están las relaciones consistentes?

```bash
# Orphaned PriceHistory
SELECT COUNT(*) FROM "PriceHistory" 
WHERE "listingId" NOT IN (SELECT id FROM "Listing");
# Si > 0: Hay datos huérfanos que causan P2032

# Orphaned Listings
SELECT COUNT(*) FROM "Listing" 
WHERE "cardId" NOT IN (SELECT id FROM "Card");
# Si > 0: Listings referencia cards inexistentes
```

### Paso 4: Verifica permisos del admin

```bash
# BD: Verifica que el admin tiene permisos
SELECT token, "storeId", "expiresAt" FROM "AdminSession" 
WHERE token = 'your-token';

# Si "storeId" es NULL: Admin global (ve todas las tiendas)
# Si "storeId" = 'uuid': Admin de una tienda (ve solo esa)
```

---

## 📚 Resumen Rápido

| Aspecto | Admin | Store |
|--------|-------|-------|
| **Cómo login** | POST /api/admin/auth/login | No login (usa UUID) |
| **Qué necesita** | email + password + storeId (opt) | x-store-id header |
| **Headers** | x-admin-token | x-store-id |
| **Ve datos** | De TODAS sus tiendas | De SU tienda solo |
| **Endpoint típico** | /api/admin/* | /api/listings/*, /api/inventory/* |
| **Error si falta auth** | 401 | 401 |
| **Error si datos huérfanos** | 500 P2032 | No accede (solo lee) |

---

## 🎬 Próximos Pasos

1. **Lee la guía de testing:** MULTI_TENANT_TESTING_GUIDE.md
2. **Ejecuta los curl examples** con tus IDs reales
3. **Si ves errores:**
   - 401 → Falta header, agrega x-store-id o x-admin-token
   - 500 → Datos huérfanos en BD, ejecuta los DELETE SQL
   - 404 → No hay datos, importa cartas primero
4. **Si todo funciona:**
   - ¡Integración exitosa!
   - Documentar tus flujos específicos

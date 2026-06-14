# NetDeckER Technical Architecture for a Clean Restart

> **Para Hermes:** este documento define cómo construir la nueva base técnica. Prioriza simplicidad, invariantes y tests sobre compatibilidad legacy.

## 1. Arquitectura recomendada

### 1.1 Estilo

Construir un **monolito modular TypeScript** con separación estricta por bounded contexts.

```text
apps/
  api/        Backend HTTP + jobs
  web/        React admin + storefront
packages/
  domain/     Tipos, schemas Zod, invariantes puros
  db/         Prisma schema/client/migrations/seeds
  tcgcsv/     Cliente TCGCSV + normalizadores
  config/     Config compartida tipada
```

Si se prefiere mantener estructura simple:

```text
backend/
frontend/
packages/shared/
```

Pero aun con estructura simple, los módulos deben estar diseñados como bounded contexts, no como archivos gigantes.

### 1.2 Stack propuesto

Backend:

- Node.js 22 LTS o versión estable equivalente.
- TypeScript estricto.
- Fastify o Express. Si se busca máxima continuidad, Express está bien; si se reinicia limpio, Fastify aporta schemas y performance.
- Prisma ORM.
- PostgreSQL producción.
- SQLite local/dev/test con schema compatible.
- Redis opcional para cache en producción; fallback in-memory/no-op en local.
- Node test runner o Vitest para backend; elegir uno y estandarizar.

Frontend:

- React 18/19 + Vite.
- TypeScript estricto.
- TanStack Query recomendado para data fetching.
- React Router.
- Zod para validar respuestas críticas si no se usa tRPC.
- CSS modular/Tailwind opcional; evitar CSS global gigante desde inicio.

No recomendado:

- Hooks custom tipo `useAsync` sin modelo de cache/identidad estable.
- Duplicar clientes API en múltiples services sin contrato común.
- Mantener handlers Cloudflare/Vercel legacy dentro del producto principal.

## 2. Bounded contexts

### 2.1 Identity & Tenant Context

Responsable de:

- stores,
- admins,
- sessions,
- roles/permissions,
- tenant resolver,
- API keys.

Contratos:

- `resolveTenant(req): TenantContext`
- `requirePermission(action, resource)`
- `assertStoreScope(entity.storeId, ctx.storeId)`

Invariante:

- Ningún servicio de negocio recibe `req`; recibe `storeId` explícito.

### 2.2 Catalog

Responsable de:

- TCG,
- Edition,
- Card,
- external set/card normalization,
- TCGCSV import metadata.

Debe conocer TCGCSV, pero no inventario ni POS.

### 2.3 Pricing

Responsable de:

- `referencePriceUSD`,
- tasa manual USD→CLP,
- margen,
- redondeo,
- historial,
- aprobaciones/volatilidad,
- sync.

Debe poder calcular precios sin DB mediante funciones puras testeables.

### 2.4 Inventory

Responsable de:

- Listing,
- stock total,
- warehouse stock futuro,
- stock movements,
- reservations,
- imports/rollbacks.

Invariante:

- Todo cambio de cantidad tiene movimiento/auditoría.
- Ventas y reservas usan transacciones.

### 2.5 Sales / POS / Orders

Responsable de:

- carrito,
- orden,
- POS session,
- cash session,
- payment transaction local,
- receipts.

Debe usar Inventory como dependencia para reservar/descontar.

### 2.6 Storefront

Responsable de:

- catálogo público,
- clientes,
- wishlist/reviews futuros,
- checkout público.

Debe consumir APIs store-scoped por slug.

### 2.7 Reporting / Analytics

Responsable de:

- dashboard,
- sales summary,
- revenue by TCG,
- store health,
- operational KPIs.

Debe degradar a cero/arrays vacíos con DB vacía.

## 3. Diagrama lógico

```text
                ┌─────────────────────────────┐
                │          React Web          │
                │ Admin + POS + Storefront    │
                └──────────────┬──────────────┘
                               │ /api same-origin in dev
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                         API Server                           │
│                                                              │
│  Identity/Tenant ─┬─ Catalog ─┬─ Pricing ─┬─ Inventory        │
│                   │           │           │                   │
│                   ├─ POS/Sales/Orders     ├─ Imports          │
│                   │                       └─ Analytics        │
│                   └─ Audit/Permissions                         │
└───────────────────────┬──────────────────────────────────────┘
                        │
             ┌──────────┴──────────┐
             ▼                     ▼
      Prisma/Postgres        TCGCSV Client
      SQLite local           (only remote catalog/price source)
```

## 4. TCGCSV integration architecture

### 4.1 Cliente TCGCSV aislado

Crear un paquete o módulo `tcgcsv` con:

```ts
export interface TcgCsvSet {
  categoryId: number;
  groupId: number;
  code: string;
  name: string;
  releaseDate?: string;
  totalCards?: number;
}

export interface TcgCsvCard {
  productId: number;
  groupId: number;
  name: string;
  cleanName?: string;
  cardNumber?: string;
  rarity?: string;
  imageUrl?: string;
  metadata: Record<string, string>;
  prices: TcgCsvPricePoint[];
}
```

Funciones:

- `listSets(tcg): Promise<TcgCsvSet[]>`
- `getSetCards(tcg, groupIdOrCode): Promise<TcgCsvCard[]>`
- `searchCards(tcg, query, options): Promise<TcgCsvCard[]>`
- `getProductPrices(tcg, productId): Promise<TcgCsvPricePoint[]>`

### 4.2 Normalización obligatoria

Preservar:

- `categoryId`,
- `groupId`,
- `productId`,
- `publicCode`/abbreviation,
- nombre del set,
- variant/subType price,
- metadata extendida.

Lección crítica:

- Algunos códigos públicos se duplican (`SRL-EN`, `PSV-EN`). El sistema debe importar por `groupId` cuando existe.

### 4.3 Cache

Local:

- In-memory LRU opcional.
- TTL corto para errores.

Producción:

- Redis opcional.

Cache keys recomendadas:

```text
tcgcsv:sets:{tcg}
tcgcsv:set:{tcg}:{groupId}:products
tcgcsv:set:{tcg}:{groupId}:prices
tcgcsv:product:{tcg}:{productId}:prices
```

Evitar cache por `setCode` si puede ser duplicado; preferir `groupId`.

## 5. Configuración local-first

Variables mínimas:

```env
NODE_ENV=development
PORT=3333
DATABASE_URL="file:./dev.sqlite"
USE_SQLITE=true
LOCAL_ONLY_MODE=true
TCGCSV_ONLY_MODE=true
TCGCSV_BASE="https://tcgcsv.com/tcgplayer"
TCGCSV_USER_AGENT="Mozilla/5.0 (compatible; NetDeckER-Local/1.0)"
MANUAL_USD_TO_CLP=1000
IMPORT_SET_SYNC_PRICES_DEFAULT=false
WEBHOOK_QUEUE_ENABLED=false
PAYMENT_RECONCILIATION_ENABLED=false
DEV_NO_AUTH=true
```

Frontend local:

```env
VITE_API_URL=/api
VITE_API_PROXY_TARGET=http://127.0.0.1:3333
VITE_API_FORCE_SAME_ORIGIN=1
VITE_DEV_NO_AUTH=true
VITE_TCGCSV_BASE=https://tcgcsv.com/tcgplayer
VITE_ALLOW_TCGCSV_DIRECT=false
VITE_MANUAL_USD_TO_CLP=1000
```

Vite debe proxyear `/api` para evitar problemas WSL/Windows donde `localhost:3333` puede fallar desde navegador aunque curl en WSL funcione.

## 6. Data fetching frontend

Recomendación fuerte: usar TanStack Query.

Ejemplo conceptual:

```ts
useQuery({
  queryKey: ['dashboard', storeId],
  queryFn: () => api.getDashboard(storeId),
  staleTime: 15_000,
});
```

Si se implementa un hook propio:

- no depender de identidad de funciones inline,
- guardar callback en `useRef`,
- re-ejecutar solo por deps explícitas,
- no reintentar `ERR_CANCELED`,
- no activar StrictMode en dev si se está midiendo Network.

## 7. Jobs y asincronía

Jobs MVP:

- `catalogSync`: opcional; deshabilitado en local salvo ejecución manual.
- `priceSync`: manual primero; cron dev-safe sin APIs extras.
- `reservationCleanup`: limpiar reservas expiradas.
- `cartCleanup`: limpiar carritos stale.
- `invoiceCleanup`: limpiar PDFs antiguos si aplica.

No activar por defecto en local:

- webhooks externos,
- reconciliación de pagos,
- integraciones de payment provider.

Para fases futuras, usar una cola real (`BullMQ`/Redis) o una tabla `JobRun`, no cron escondido sin observabilidad.

## 8. Error handling

Formato estándar:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "...",
    "statusCode": 400,
    "timestamp": "...",
    "requestId": "..."
  }
}
```

Códigos clave:

- `VALIDATION_ERROR`
- `NOT_FOUND`
- `CONFLICT`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `TENANT_SCOPE_ERROR`
- `EXTERNAL_PROVIDER_DISABLED`
- `TCGCSV_UNAVAILABLE`
- `IMPORT_VALIDATION_FAILED`
- `INSUFFICIENT_STOCK`

Regla:

- Errores esperados como `EXTERNAL_PROVIDER_DISABLED` no deben imprimir stack trace completo.

## 9. Testing strategy

### 9.1 Unit tests puros

- pricing calculations,
- TCGCSV normalization,
- CSV parsing,
- stock invariants,
- tenant resolver rules,
- API URL/proxy helpers,
- data-fetch retry/cancel logic.

### 9.2 Service tests con Prisma stub o SQLite

- import set/card,
- price sync scope,
- inventory import rollback,
- POS sale stock decrement,
- dashboard operational health.

### 9.3 API integration tests

- admin dashboard empty DB,
- external sets list,
- import set dry-run/apply,
- listings available/low-stock,
- POS sale,
- storefront catalog.

### 9.4 Browser smoke

Mínimo con Playwright/Chrome:

- cargar dashboard,
- verificar una request por endpoint principal,
- importar set pequeño/dry-run,
- ver inventario,
- venta POS básica.

## 10. Observabilidad

Mínimo:

- request id,
- structured logs JSON en backend,
- log de job runs,
- audit trail por usuario/store,
- métricas `/metrics` opcionales.

Eventos auditables:

- login/logout,
- cambio stock,
- importación,
- rollback,
- venta POS,
- cambio precio,
- cambio margen/tasa,
- cambio estado orden,
- rotación API key.

## 11. Qué NO copiar del repositorio actual

No copiar directamente:

- handlers legacy `backend/src/functions/**`,
- archivos `legacy/**`,
- compatibilidad D1/Cloudflare si no se usará,
- múltiples páginas solapadas de inventario/importación,
- scripts de debug temporales,
- integraciones de pagos parcialmente cableadas,
- lógica grande monolítica como `InventoryService.ts` de 1200+ líneas sin descomponer.

Sí conservar conceptualmente:

- TCGCSV category IDs,
- local bootstrap de tienda/TCGs,
- store-scoped price sync,
- dashboard operational health,
- import/export requirements,
- same-origin Vite proxy,
- duplicate set code handling con `groupId`,
- provider guards para local-only.

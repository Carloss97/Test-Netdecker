# NetDeckER Clean Restart Phased Implementation Roadmap

> **For Hermes:** implement this plan task-by-task using TDD. Do not skip phases unless the user explicitly changes priorities.

**Goal:** build a clean local-first multitenant TCG singles platform from zero.

**Architecture:** modular TypeScript monolith with Prisma, TCGCSV-only catalog/pricing source, React/Vite frontend and strict tenant scoping. Start with the smallest usable vertical slice, then grow into POS/storefront/reporting.

**Tech Stack:** Node.js, TypeScript, Prisma, SQLite local, PostgreSQL production, React, Vite, TanStack Query recommended, Zod, Vitest/Node test runner.

---

## Fase A — Proyecto base y local-first foundation

**Estado:** [ ] Por implementar  
**Prioridad:** Crítica  
**Objetivo:** crear repo nuevo que arranque localmente sin credenciales externas.

**Archivos esperados:**

- `package.json`
- `apps/api/package.json`
- `apps/web/package.json`
- `packages/db/prisma/schema.prisma`
- `apps/api/src/server.ts`
- `apps/api/src/app.ts`
- `apps/web/src/main.tsx`
- `.env.local.example`
- `README.md`

**Tareas:**

1. Crear monorepo TypeScript.
2. Configurar backend API con health route.
3. Configurar frontend Vite con proxy `/api` a `127.0.0.1:3333`.
4. Configurar Prisma SQLite local.
5. Crear script `dev` que levante API + web.
6. Crear script `db:generate:safe` que detecte SQLite.
7. Crear smoke local.

**Tests RED/GREEN mínimos:**

- `GET /api/health` devuelve 200.
- `http://localhost:3000/api/health` vía proxy devuelve 200.
- build frontend y backend pasan.

**Criterios de éxito:**

```bash
npm install
npm run db:generate:safe
npm run dev
curl http://localhost:3000/api/health
npm run build
```

## Fase B — Modelo de datos base y seed local

**Estado:** [ ] Por implementar  
**Prioridad:** Crítica  
**Objetivo:** modelar Store, TCG, Edition, Card, Listing y bootstrap local.

**Archivos:**

- `packages/db/prisma/schema.prisma`
- `apps/api/src/modules/bootstrap/localBootstrap.service.ts`
- `apps/api/src/modules/tcg/tcg.service.ts`
- `apps/api/src/modules/tcg/tcg.routes.ts`
- tests de bootstrap y TCG.

**Tareas:**

1. Crear modelos Store, TCG, Edition, Card, Listing.
2. Agregar `tcgcsvCategoryId` a TCG.
3. Agregar `externalGroupId` a Edition.
4. Agregar `externalProductId` a Card.
5. Crear seed idempotente de TCGs base.
6. Crear `ensureLocalStore()`.
7. Exponer `GET /api/tcgs`.

**Tests:**

- seed crea seis TCGs.
- bootstrap crea `local-store` una vez.
- repeated bootstrap es idempotente.
- `GET /api/tcgs` devuelve seis TCGs en DB vacía después de bootstrap.

**Criterios de éxito:** DB local nueva es usable sin pasos manuales.

## Fase C — Tenant context y auth admin local

**Estado:** [ ] Por implementar  
**Prioridad:** Crítica  
**Objetivo:** garantizar scope por tienda antes de crear datos operativos.

**Archivos:**

- `apps/api/src/modules/auth/adminAuth.service.ts`
- `apps/api/src/middleware/tenantResolver.ts`
- `apps/api/src/middleware/requireAdmin.ts`
- `apps/api/src/middleware/requirePermission.ts`
- `apps/web/src/routes/RequireAdmin.tsx`

**Tareas:**

1. Crear AdminUser/AdminSession.
2. Implementar dev no-auth seguro para local.
3. Implementar tenant resolver por sesión/header/slug.
4. Bloquear cambio de tienda para admin scoped.
5. Crear endpoints login/me/logout.
6. Crear UI login mínima.

**Tests:**

- admin scoped ignora `x-store-id` ajeno.
- dev no-auth solo funciona fuera de producción.
- rutas admin sin sesión devuelven 401 si no hay bypass.

**Criterios de éxito:** todos los servicios posteriores reciben `storeId` explícito.

## Fase D — Cliente TCGCSV y normalizadores

**Estado:** [ ] Por implementar  
**Prioridad:** Crítica  
**Objetivo:** centralizar TCGCSV con category IDs, throttle, cache, normalización y soporte de `groupId`.

**Archivos:**

- `packages/tcgcsv/src/client.ts`
- `packages/tcgcsv/src/normalizers.ts`
- `apps/api/src/modules/external/external.routes.ts`
- tests unitarios.

**Tareas:**

1. Definir TCGCSV category IDs.
2. Implementar `listSets`.
3. Implementar `getSetCards` por `groupId` o fallback `code`.
4. Implementar `getGroupProducts`/`getGroupPrices`.
5. Mapear price points y metadata.
6. Exponer `GET /api/external/sets`.
7. Exponer `GET /api/external/search` básico.
8. Agregar cache in-memory/local y Redis opcional.

**Tests:**

- duplicate set codes tienen row keys únicas.
- import ref usa `groupId` cuando existe.
- `YUGIOH` usa category `2`.
- `WEISS_SCHWARZ` usa category `20`.
- cliente degrada a `[]` si TCGCSV falla.

**Criterios de éxito:** UI puede listar sets de cada TCG y distinguir duplicados.

## Fase E — Importación de catálogo desde TCGCSV

**Estado:** [ ] Por implementar  
**Prioridad:** Crítica  
**Objetivo:** importar sets/cartas a catálogo local y crear listings iniciales por tienda.

**Archivos:**

- `apps/api/src/modules/catalog/catalogImport.service.ts`
- `apps/api/src/modules/external/externalImport.routes.ts`
- `apps/web/src/pages/ImportPage.tsx`
- `apps/web/src/lib/externalSets.ts`

**Tareas:**

1. Crear `importSet({storeId, tcg, groupId, createListings, initialQuantity})`.
2. Upsert Edition por `(tcgId, externalGroupId)`.
3. Upsert Card por external product id/variant.
4. Crear Listing por store/card/condition.
5. Registrar import summary.
6. Mostrar UI de sets con código público + groupId en tooltip.
7. Botón import set usa `groupId`.

**Tests:**

- importar set duplicado por groupId crea la edición correcta.
- import set sin storeId falla si crea listings.
- import set es idempotente.
- UI no emite duplicate key warnings con códigos repetidos.

**Criterios de éxito:** importar set pequeño produce cards/listings visibles.

## Fase F — Pricing engine local

**Estado:** [ ] Por implementar  
**Prioridad:** Crítica  
**Objetivo:** calcular precios CLP de forma determinística y auditable.

**Archivos:**

- `apps/api/src/modules/pricing/pricing.service.ts`
- `apps/api/src/modules/pricing/pricing.routes.ts`
- `apps/api/src/modules/pricing/priceHistory.service.ts`

**Tareas:**

1. Crear función pura `calculateFinalPrice`.
2. Crear config de tasa manual USD→CLP.
3. Crear redondeo configurable.
4. Crear preview endpoint.
5. Crear update listing price.
6. Crear PriceHistory.
7. Crear thresholds de volatilidad.

**Tests:**

- reference 2.5 USD, tasa 1000, margen 1.35, redondeo 100 => resultado esperado.
- tasa manual no llama API externa.
- cambio volátil genera pending approval si config exige.

**Criterios de éxito:** precio final siempre explica su cálculo.

## Fase G — Inventario, CSV import/export y rollback

**Estado:** [ ] Por implementar  
**Prioridad:** Alta  
**Objetivo:** cargar, validar, modificar, exportar y revertir inventario con trazabilidad.

**Archivos:**

- `apps/api/src/modules/inventory/inventory.service.ts`
- `apps/api/src/modules/inventory/csvImport.service.ts`
- `apps/api/src/modules/inventory/inventory.routes.ts`
- `apps/web/src/pages/InventoryPage.tsx`
- `apps/web/src/pages/ImportPage.tsx`

**Tareas:**

1. Implementar parse CSV puro.
2. Validar headers para modes: listing-update/full-upsert.
3. Dry-run de importación.
4. Apply con transacción/batches.
5. Registrar `InventoryImport` y `InventoryImportChange`.
6. Crear `StockMovement` por cambio.
7. Implementar rollback.
8. Exportar CSV reimportable.

**Tests:**

- CSV sin columnas requeridas falla antes de write.
- dry-run no modifica DB.
- apply modifica cantidades y movimientos.
- rollback restaura cantidades.
- export all/tcg/edition filtra por storeId.

**Criterios de éxito:** restock real se puede cargar y revertir.

## Fase H — Listings UI, stock bajo y dashboard operativo

**Estado:** [ ] Por implementar  
**Prioridad:** Alta  
**Objetivo:** dar control visual de inventario y salud de tienda.

**Archivos:**

- `apps/api/src/modules/listings/listings.routes.ts`
- `apps/api/src/modules/analytics/dashboard.service.ts`
- `apps/web/src/pages/DashboardPage.tsx`
- `apps/web/src/pages/CatalogPage.tsx`

**Tareas:**

1. Listar inventory/listings con filtros.
2. Editar stock inline.
3. Mostrar stock bajo.
4. Dashboard KPIs.
5. Store operational health score.
6. Recent imports y sync runs.
7. Empty DB state sin 500.

**Tests:**

- dashboard empty DB => zeros.
- inventory value usa `finalPrice * quantity`.
- low stock excluye out-of-stock si corresponde.
- queries dashboard reciben `storeId`.

**Criterios de éxito:** dueño entiende estado de tienda en un vistazo.

## Fase I — POS local y órdenes

**Estado:** [ ] Por implementar  
**Prioridad:** Alta  
**Objetivo:** vender presencialmente sin oversell.

**Archivos:**

- `apps/api/src/modules/pos/pos.service.ts`
- `apps/api/src/modules/orders/order.service.ts`
- `apps/api/src/modules/payments/localPayment.service.ts`
- `apps/web/src/pages/PosPage.tsx`
- `apps/web/src/pages/OrdersPage.tsx`

**Tareas:**

1. Crear POS session.
2. Agregar/quitar items.
3. Completar venta en transacción.
4. Descontar stock.
5. Crear order/orderItems/paymentTransaction.
6. Crear receipt básico.
7. Listar órdenes.

**Tests:**

- venta con stock suficiente descuenta y crea orden.
- venta con stock insuficiente falla sin cambios parciales.
- no se puede vender listing de otra tienda.

**Criterios de éxito:** flujo POS completo local.

## Fase J — Storefront público mínimo

**Estado:** [ ] Por implementar  
**Prioridad:** Media-Alta  
**Objetivo:** catálogo público por tienda con carrito/checkout simple.

**Archivos:**

- `apps/api/src/modules/public/public.routes.ts`
- `apps/api/src/modules/cart/cart.service.ts`
- `apps/web/src/pages/StorefrontPage.tsx`
- `apps/web/src/pages/CheckoutPage.tsx`

**Tareas:**

1. Resolver tienda por slug.
2. Listar productos públicos activos con stock.
3. Crear carrito por sessionId.
4. Agregar/actualizar/remover items.
5. Checkout crea orden pendiente/confirmada.
6. Descontar o reservar stock según decisión MVP.

**Tests:**

- storefront de tienda A no muestra tienda B.
- carrito no acepta stock insuficiente.
- checkout crea orden store-scoped.

**Criterios de éxito:** cliente puede crear pedido básico.

## Fase K — Facturas, recibos y documentos

**Estado:** [ ] Por implementar  
**Prioridad:** Media  
**Objetivo:** generar documentos internos para ventas/pedidos.

**Tareas:**

1. Definir Invoice/Receipt model.
2. Generar PDF o HTML imprimible.
3. Endpoint de descarga.
4. Historial por orden.
5. Cleanup job opcional.

**Tests:**

- orden genera recibo con total correcto.
- descarga requiere store scope.

## Fase L — Hardening multi-tenant y seguridad

**Estado:** [ ] Por implementar  
**Prioridad:** Alta antes de producción  
**Objetivo:** cerrar fugas cross-tenant y roles.

**Tareas:**

1. Contract tests para rutas principales con dos tiendas.
2. Revisar todos los `findMany/update/delete` de servicios.
3. API keys por tienda.
4. Audit trail.
5. Rate limiting admin/auth.

**Criterios:** tests demuestran que Store A no ve/modifica Store B.

## Fase M — Jobs, sync y observabilidad

**Estado:** [ ] Por implementar  
**Prioridad:** Media  
**Objetivo:** hacer syncs controlados y visibles.

**Tareas:**

1. Tabla `JobRun` o `SyncRun` genérica.
2. Manual catalog sync.
3. Manual price sync.
4. Cron opcional por env.
5. Logs estructurados.
6. Métricas básicas.

## Fase N — Pagos externos opcionales

**Estado:** [ ] Futuro  
**Prioridad:** Baja para MVP local  
**Objetivo:** integrar Stripe/MercadoPago sin romper modo local.

**Reglas:**

- providers deshabilitados por defecto en local,
- imports dinámicos solo si configurados,
- webhooks verificables,
- reconciliación en job observable,
- nunca bloquear POS local por falta de provider.

## Fase O — Deploy productivo

**Estado:** [ ] Futuro  
**Prioridad:** Media  
**Objetivo:** pasar de local-first a producción.

**Tareas:**

1. PostgreSQL.
2. Redis opcional.
3. Build Docker/API.
4. Vercel/Render/Fly/Railway según decisión.
5. Variables prod.
6. Migraciones.
7. Backups.
8. Smoke staging.

## Definition of Done global

Una fase no está completa hasta que:

1. Tiene tests nuevos o actualizados.
2. Los tests fallaron antes cuando aplica.
3. Pasan tests focalizados.
4. Pasa type-check.
5. Pasa build.
6. Se ejecutó smoke del flujo real.
7. Se actualizó documentación si cambió contrato.
8. No hay llamadas externas no permitidas en local.

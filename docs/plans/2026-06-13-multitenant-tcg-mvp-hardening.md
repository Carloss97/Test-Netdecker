# Multitenant TCG MVP Hardening Implementation Plan

> **For Hermes:** Use TDD for each code change and verify with targeted tests plus build.

**Goal:** Improve the MVP as a multi-tenant TCG store platform for singles price freshness, inventory, invoicing/POS, and local PoC reliability.

**Architecture:** Keep the current Express/Prisma backend and React/Vite frontend, but tighten tenant boundaries at service and route layers before adding broader UX features. Prioritize correctness for store-scoped price sync, inventory ownership, invoice/order traceability, and operational visibility.

**Tech Stack:** Node.js/TypeScript, Express, Prisma, SQLite local development, React/Vite, Node test runner, Vitest.

---

## Fase A — Guardrails multitenant para sincronización de precios

**Estado:** [x] Completado  
**Prioridad:** Crítica  
**Objetivo:** evitar que una tienda ejecute o vea sincronizaciones de precios de otra tienda.

**Archivos:**
- Modificar: `backend/src/services/PriceSyncService.ts`
- Modificar: `backend/src/routes/listing.routes.ts`
- Modificar: `backend/src/services/ExternalImportService.ts`
- Modificar/Test: `backend/src/routes/listing.routes.test.ts`

**Tareas:**
1. Agregar `storeId?: string` a `RunPriceSyncInput`.
2. Persistir `storeId` en `PriceSyncRun.create` cuando exista.
3. Filtrar `prisma.listing.findMany` por `storeId` en sync automático sin `updates` explícitos.
4. En validación por lote (`currentListings`), filtrar `id in listingIds` + `storeId` cuando exista para bloquear updates cross-tenant.
5. Pasar `storeId` desde `listing.routes.ts` usando `requireStore(req)` en `/sync-prices`, `/sync-prices/runs` y `/sync-prices/runs/:runId`.
6. Pasar `options.storeId` al background sync de `ExternalImportService.importSet`.
7. Agregar tests de ruta que fallen si `storeId` no viaja a `PriceSyncService`.

**Criterios de éxito:** una tienda solo sincroniza/lista/consulta runs de su propio scope; tests focalizados pasan.

## Fase B — Observabilidad comercial de precios e inventario

**Estado:** [x] Completado  
**Prioridad:** Alta  
**Objetivo:** dar a cada tienda un panel operativo: precios stale, últimas importaciones, bajo stock, out-of-stock, valor inventario, margen medio y errores de sync.

**Archivos previstos:**
- `backend/src/services/StoreHealthService.ts`
- `backend/src/services/StoreHealthService.test.ts`
- `backend/src/routes/admin.routes.ts`
- `backend/src/routes/admin.routes.test.ts`
- `frontend/src/pages/DashboardPage.tsx`
- `frontend/src/types/index.ts`

**Criterios de éxito:** dashboard por tienda muestra salud accionable y no mezcla tenants.

**Verificación:**
1. RED: `cd backend && npx tsx --test src/services/StoreHealthService.test.ts` — falló por módulo inexistente.
2. GREEN focalizado: `cd backend && npx tsx --test --test-name-pattern "StoreHealthService returns|dashboard includes tenant-scoped operational health" src/services/StoreHealthService.test.ts src/routes/admin.routes.test.ts` — `2 passed / 0 failed`.
3. Type-check: `npm --prefix backend run type-check && npm --prefix frontend run type-check` — OK.
4. Build: `npm run build` — OK.

## Fase C — Inventario y POS con trazabilidad completa

**Estado:** [ ] Por implementar  
**Prioridad:** Alta  
**Objetivo:** reforzar entradas/salidas/transferencias, reservas, POS y cash sessions con auditoría y stock invariants.

**Archivos previstos:**
- `backend/src/services/InventoryService.ts`
- `backend/src/services/ReservationService.ts`
- `backend/src/services/PaymentService.ts`
- `backend/src/routes/pos.routes.ts`

**Criterios de éxito:** no hay oversell, cada movimiento tiene actor/tienda/motivo, y cada venta descuenta stock de la tienda correcta.

## Fase D — Facturación y documentos del MVP

**Estado:** [ ] Por implementar  
**Prioridad:** Media-Alta  
**Objetivo:** cerrar flujo orden → comprobante/boleta interna → PDF → historial por tienda.

**Archivos previstos:**
- `backend/src/services/InvoiceService.ts`
- `backend/src/services/InvoicePdfService.ts`
- `backend/src/routes/invoices.routes.ts`
- `frontend/src/pages/OrderDetailPage.tsx`

**Criterios de éxito:** cada orden puede generar/ver factura local, con folio por tienda y PDF descargable.

## Fase E — Importación TCGCSV y calidad de catálogo

**Estado:** [ ] Por implementar  
**Prioridad:** Media-Alta  
**Objetivo:** mejorar flujo de importación de sets/singles: deduplicación, validación, resumen previo, rollback y reporte de cards sin precio.

**Archivos previstos:**
- `backend/src/services/ExternalImportService.ts`
- `backend/src/services/TCGCsvService.ts`
- `frontend/src/pages/ImportPage.tsx`
- `frontend/src/pages/CatalogPage.tsx`

**Criterios de éxito:** importar sets grandes es predecible, auditable, reversible y con precios claros.

## Fase F — QA local y smoke PoC

**Estado:** [ ] Por implementar  
**Prioridad:** Media  
**Objetivo:** comandos rápidos para demostrar localmente: crear tienda, importar set, sync precios, vender por POS, generar factura y revisar dashboard.

**Archivos previstos:**
- `backend/scripts/provision-test-store.mjs`
- `scripts/smoke/local-mvp-smoke.ts`
- `README.md`
- `backend/README.local.md`

**Criterios de éxito:** un solo smoke local valida el recorrido principal sin APIs externas no TCGCSV.

## Verificación de Fase A

1. RED: `cd backend && npx tsx --test src/routes/listing.routes.test.ts` — falló como esperado porque `storeId` no viajaba a `PriceSyncService`.
2. GREEN: `cd backend && npx tsx --test src/tests/PriceSyncRunPersistence.test.ts src/routes/listing.routes.test.ts` — `7 passed / 0 failed`.
3. Regresión: `npm --prefix backend run type-check` — OK.
4. Build: `npm run build` — OK.

# Dashboard Analytics Local Stability Plan

> **For Hermes:** Debugging sistemático + TDD. No basta con que un endpoint aislado pase; debe probarse el set exacto que carga `DashboardPage`.

**Goal:** eliminar los errores de carga de dashboard local (`/api/admin/dashboard`, `/api/analytics/sales-summary`, `/api/analytics/revenue-by-tcg`) y evitar spam/500 por dependencias no disponibles en SQLite local.

**Architecture:** el dashboard local degrada de forma segura cuando una tabla opcional del MVP completo no existe o está vacía. Los servicios analíticos devuelven totales cero en DB local vacía; auditoría es no bloqueante y silenciosa para incompatibilidades de schema SQLite; los endpoints responden JSON 200 o error controlado, nunca resets ni bucles de retry en el frontend.

**Tech Stack:** Express, Prisma SQLite, TypeScript, tsx test runner, Vite frontend.

---

## Root cause confirmado

1. `/api/analytics/sales-summary` reproducía 500 por `TypeError: Cannot read properties of undefined (reading 'findMany')` en `AnalyticsService.ts:30`.
2. La causa inmediata era `prisma.expense` inexistente en el cliente SQLite local; `AnalyticsService.getSalesSummary()` lo asumía disponible.
3. `/api/admin/dashboard` respondía 200, pero generaba spam interno por `AuditService.logAction()` intentando escribir `userId` con un shape que SQLite/Prisma no acepta en ese cliente. Auditoría debe ser no bloqueante y no llenar logs en local.
4. `/api/analytics/revenue-by-tcg` ya respondía 200 `[]` en DB vacía, pero quedó incluido en el smoke final.

## Fase A — Analytics local-safe

**Estado:** [x] Completado  
**Prioridad:** Crítica  
**Objetivo:** que `sales-summary` devuelva resumen cero si `expense` no existe o la DB está vacía.

**Archivos:**
- Modificado: `backend/src/services/AnalyticsService.ts`
- Creado: `backend/src/services/AnalyticsService.test.ts`

**Tareas:**
1. [x] Escribir test RED que simula `prisma.expense = undefined`.
2. [x] Implementar guard helper para delegates opcionales.
3. [x] Si `expense` no existe, usar `totalExpenses=0`.
4. [x] Mantener cálculo normal cuando exista `expense.findMany`.

**Criterios de éxito:** test RED pasa en GREEN y `/api/analytics/sales-summary` responde 200 con `{ totalRevenue: 0, totalExpenses: 0, grossProfit: 0, orderCount: 0, profitMargin: 0 }`.

**Evidencia:** RED falló con `Cannot read properties of undefined (reading 'findMany')`; GREEN incluido en Fase C.

## Fase B — Auditoría local silenciosa

**Estado:** [x] Completado  
**Prioridad:** Alta  
**Objetivo:** que auditoría no rompa ni ensucie logs cuando el cliente SQLite no acepte el shape Postgres completo.

**Archivos:**
- Modificado: `backend/src/services/AuditService.ts`
- Modificado: `backend/src/services/AuditService.test.ts`

**Tareas:**
1. [x] Escribir test para error Prisma tipo `Unknown argument userId`.
2. [x] Convertir ese caso en no-op silencioso para auditoría local incompatible.
3. [x] Mantener la auditoría completa para clientes que sí soporten el shape.

**Criterios de éxito:** `/api/admin/dashboard` no imprime stacktrace de auditoría en local.

**Evidencia:** el log posterior al smoke muestra requests a `/api/admin/dashboard`, `/api/analytics/sales-summary`, `/api/analytics/revenue-by-tcg` sin stacktrace de audit ni errores de Analytics.

## Fase C — Tests focalizados

**Estado:** [x] Completado  
**Prioridad:** Alta  
**Objetivo:** fijar regresiones para analytics y auditoría local.

**Comandos:**
1. `SKIP_DB_INIT=true npx tsx --test src/services/AnalyticsService.test.ts --test-name-pattern "schema incompatibility" src/services/AuditService.test.ts`

**Resultado:** `5 passed / 0 failed`.

## Fase D — Smoke dashboard completo

**Estado:** [x] Completado  
**Prioridad:** Crítica  
**Comandos ejecutados:**
1. `npm --prefix backend run type-check` — OK.
2. `npm --prefix frontend run type-check` — OK.
3. `npm run build` — OK.
4. `NODE_ENV=development LOCAL_ONLY_MODE=true TCGCSV_ONLY_MODE=true WEBHOOK_QUEUE_ENABLED=false npm run dev` — frontend y backend levantaron.
5. `curl -I http://localhost:3000/` — 200.
6. Endpoints:
   - `/api/admin/dashboard` — 200 JSON.
   - `/api/analytics/sales-summary` — 200 JSON con totales cero.
   - `/api/analytics/revenue-by-tcg` — 200 JSON `[]`.
   - `/api/tcgs` — 200 JSON con TCGs base.
   - `/api/listings/available?tcgId=MAGIC` — 200 `[]`.
   - `/api/listings/low-stock?threshold=5` — 200 `[]`.
   - `/api/inventory/imports?pageSize=5` — 200 JSON paginado vacío.

**Criterios de éxito:** todos responden 200/JSON en local, frontend `http://localhost:3000/` sirve 200, sin `[WebhookQueueJob] Failed`, sin stacktrace de audit local, sin resets.

**Resultado:** cumplido.

# Dashboard Analytics Local Stability Plan

> **For Hermes:** Debugging sistemático + TDD. No basta con que un endpoint aislado pase; debe probarse el set exacto que carga `DashboardPage`.

**Goal:** eliminar los errores de carga de dashboard local (`/api/admin/dashboard`, `/api/analytics/sales-summary`, `/api/analytics/revenue-by-tcg`) y evitar spam/500 por dependencias no disponibles en SQLite local.

**Architecture:** el dashboard local debe degradar de forma segura cuando una tabla opcional del MVP completo no existe o está vacía. Los servicios analíticos deben devolver totales cero en DB local vacía; auditoría debe ser no bloqueante y silenciosa para incompatibilidades de schema SQLite; los endpoints deben responder JSON 200 o error controlado, nunca provocar resets ni bucles de retry en el frontend.

**Tech Stack:** Express, Prisma SQLite, TypeScript, tsx test runner, Vite frontend.

---

## Root cause confirmado

1. `/api/analytics/sales-summary` reproduce 500 por `TypeError: Cannot read properties of undefined (reading 'findMany')` en `AnalyticsService.ts:30`.
2. La causa inmediata es `prisma.expense` inexistente en el cliente SQLite local; `AnalyticsService.getSalesSummary()` lo asumía disponible.
3. `/api/admin/dashboard` responde 200, pero genera spam interno por `AuditService.logAction()` intentando escribir `userId` con un shape que SQLite/Prisma no acepta en ese cliente. Auditoría debe ser no bloqueante y no llenar logs en local.
4. `/api/analytics/revenue-by-tcg` ya responde 200 `[]` en DB vacía, pero debe quedar cubierto en el smoke final.

## Fase A — Analytics local-safe

**Estado:** [~] En trabajo  
**Prioridad:** Crítica  
**Objetivo:** que `sales-summary` devuelva resumen cero si `expense` no existe o la DB está vacía.

**Archivos:**
- Modificar: `backend/src/services/AnalyticsService.ts`
- Crear: `backend/src/services/AnalyticsService.test.ts`

**Tareas:**
1. Escribir test RED que simule `prisma.expense = undefined`.
2. Implementar guard helper para delegates opcionales.
3. Si `expense` no existe, usar `totalExpenses=0`.
4. Mantener cálculo normal cuando exista `expense.findMany`.

**Criterios de éxito:** test RED pasa en GREEN y `/api/analytics/sales-summary` responde 200 con `{ totalRevenue: 0, totalExpenses: 0, grossProfit: 0, orderCount: 0, profitMargin: 0 }`.

## Fase B — Auditoría local silenciosa

**Estado:** [ ] Por implementar  
**Prioridad:** Alta  
**Objetivo:** que auditoría no rompa ni ensucie logs cuando el cliente SQLite no acepte el shape Postgres completo.

**Archivos:**
- Modificar: `backend/src/services/AuditService.ts`
- Modificar: `backend/src/services/AuditService.test.ts`

**Tareas:**
1. Escribir test para error Prisma tipo `Unknown argument userId`.
2. Convertir ese caso en no-op silencioso o fallback sin `userId` ni campos incompatibles.
3. Mantener la auditoría completa para clientes que sí soporten el shape.

**Criterios de éxito:** `/api/admin/dashboard` no imprime stacktrace de auditoría en local.

## Fase C — Smoke dashboard completo

**Estado:** [ ] Por implementar  
**Prioridad:** Crítica  
**Comandos:**
1. Tests focalizados de `AnalyticsService` y `AuditService`.
2. `npm --prefix backend run type-check`.
3. `npm --prefix frontend run type-check`.
4. `npm run build`.
5. `npm run dev` y `curl` a:
   - `/api/admin/dashboard`
   - `/api/analytics/sales-summary`
   - `/api/analytics/revenue-by-tcg`
   - `/api/tcgs`
   - `/api/listings/available?tcgId=MAGIC`
   - `/api/listings/low-stock?threshold=5`
   - `/api/inventory/imports?pageSize=5`

**Criterios de éxito:** todos responden 200/JSON en local, frontend `http://localhost:3000/` sirve 200, sin `[WebhookQueueJob] Failed`, sin stacktrace de audit local, sin resets.

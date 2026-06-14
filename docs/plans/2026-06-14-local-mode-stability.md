# Local Mode Stability Implementation Plan

> **For Hermes:** Implementar con debugging sistemático + TDD, sin asumir que el build basta. Debe terminar con smoke real de API local y frontend.

**Goal:** dejar el MVP usable en desarrollo local: backend estable en `localhost:3333`, endpoints críticos respondiendo JSON, tenant local resuelto automáticamente y Prisma SQLite alineado con el código que consume TCGCSV.

**Architecture:** el modo local-first ahora es autosuficiente: si no hay sesión/tienda, resuelve o crea una tienda local por defecto; si no hay datos base, crea TCGs por defecto; si se usa SQLite, genera el cliente SQLite correcto y empuja el esquema local antes de arrancar. Las rutas deben devolver JSON controlado, nunca resets por procesos que mueren ni validaciones Prisma evitables.

**Tech Stack:** Node.js, Express, Prisma SQLite, Vite, TypeScript, tsx test runner.

---

## Root cause confirmado

1. `/api/tcgs` devolvía 500 porque `TCGService.getAllTCGs()` filtraba por `TCG.isActive`, pero el cliente SQLite generado no tenía ese campo: `Unknown argument isActive`.
2. `backend/scripts/prisma-generate-safe.js` ejecutaba `npx prisma generate` con el schema Postgres por defecto, aunque el runtime local carga `@prisma/client_sqlite_generated`. Eso dejaba el cliente SQLite potencialmente stale.
3. La base local SQLite estaba vacía: `store=0`, `tCG=0`, `edition=0`, `card=0`, `listing=0`, `inventoryImport=0`.
4. `/api/listings/available` y `/api/listings/low-stock` respondían 401 si el frontend no mandaba `x-store-id`, porque `tenantResolver` no tenía fallback local.
5. `/api/inventory/imports` dependía de auth admin; en local debía navegarse sin setup manual de sesiones.

## Fase A — Prisma SQLite local correcto

**Estado:** [x] Completado  
**Prioridad:** Crítica  
**Objetivo:** que el cliente SQLite que realmente usa el backend tenga los campos que el código consulta.

**Archivos:**
- Modificado: `backend/prisma/schema.sqlite.prisma`
- Modificado: `backend/scripts/prisma-generate-safe.js`

**Tareas:**
1. [x] Añadir `TCG.isActive Boolean @default(true)` a `schema.sqlite.prisma`.
2. [x] Añadir paridad mínima de metadata de cartas: `Card.cardType`, `Card.attribute`, `Card.metadata` como `String?` compatible con SQLite.
3. [x] Hacer que `prisma-generate-safe.js` detecte SQLite (`USE_SQLITE=true` o `DATABASE_URL=file:`) y ejecute `prisma generate --schema=prisma/schema.sqlite.prisma`.
4. [x] En SQLite local, ejecutar también `prisma db push --schema=prisma/schema.sqlite.prisma --accept-data-loss` para que `dev.sqlite` reciba columnas/tablas faltantes.

**Criterios de éxito:** `npm --prefix backend run prisma:generate:safe` genera `@prisma/client_sqlite_generated` y `GET /api/tcgs` deja de fallar por `Unknown argument isActive`.

**Evidencia:** `USE_SQLITE=true DATABASE_URL=file:./dev.sqlite npm --prefix backend run prisma:generate:safe` generó el cliente SQLite y sincronizó `dev.sqlite` correctamente.

## Fase B — Bootstrap local mínimo

**Estado:** [x] Completado  
**Prioridad:** Crítica  
**Objetivo:** que una base vacía sea navegable sin setup manual.

**Archivos:**
- Creado: `backend/src/services/LocalBootstrapService.ts`
- Creado: `backend/src/services/LocalBootstrapService.test.ts`
- Modificado: `backend/src/services/TCGService.ts`
- Modificado: `backend/src/middleware/tenantResolver.ts`
- Modificado: `backend/src/middleware/requireAdmin.ts`
- Modificado: `backend/src/middleware/requirePermission.ts`

**Tareas:**
1. [x] Crear helper que asegura tienda local por defecto `local-store` cuando `LOCAL_ONLY_MODE=true`.
2. [x] Crear helper que asegura TCGs base (`MAGIC`, `POKEMON`, `YUGIOH`, `ONE_PIECE`, `DIGIMON`, `WEISS_SCHWARZ`) cuando la tabla está vacía.
3. [x] En `tenantResolver`, si no se resuelve tenant y `LOCAL_ONLY_MODE=true`, usar/crear tienda local.
4. [x] En `TCGService.getAllTCGs()`, si no hay TCGs en modo local, inicializarlos y reconsultar.
5. [x] Permitir bypass admin/permission fuera de producción cuando `LOCAL_ONLY_MODE=true`, para que pantallas locales no dependan de sesiones reales.

**Criterios de éxito:** sin headers ni sesión real, `GET /api/listings/available?tcgId=MAGIC` y `GET /api/listings/low-stock?threshold=5` responden 200 con arrays, y `/api/tcgs` responde lista base.

**Evidencia:** smoke API local confirmó 200 para `/api/tcgs`, `/api/listings/available?tcgId=MAGIC`, `/api/listings/low-stock?threshold=5` y `/api/inventory/imports?pageSize=5`.

## Fase C — Pruebas RED/GREEN de endpoints críticos

**Estado:** [x] Completado  
**Prioridad:** Alta  
**Objetivo:** fijar regresiones para bootstrap local y endpoints que reportó el frontend.

**Archivos:**
- Creado: `backend/src/services/LocalBootstrapService.test.ts`
- Reutilizado: `backend/src/services/WebhookQueueService.test.ts`

**RED:**
- `SKIP_DB_INIT=true npx tsx --test src/services/LocalBootstrapService.test.ts` falló inicialmente por módulo inexistente `LocalBootstrapService.js`.
- Antes del fix, `curl /api/tcgs` devolvía 500 con `Unknown argument isActive` y listings devolvían 401 por tenant faltante.

**GREEN:**
- `SKIP_DB_INIT=true npx tsx --test src/services/LocalBootstrapService.test.ts` — `2 passed / 0 failed`.
- `npx tsx --test --test-name-pattern "webhook tables are unavailable|WebhookQueueService retries|WebhookQueueService moves" src/services/WebhookQueueService.test.ts` — `3 passed / 0 failed`.

## Fase D — Smoke real local

**Estado:** [x] Completado  
**Prioridad:** Crítica  
**Comandos ejecutados:**
1. `USE_SQLITE=true DATABASE_URL=file:./dev.sqlite npm --prefix backend run prisma:generate:safe` — OK.
2. `SKIP_DB_INIT=true npx tsx --test src/services/LocalBootstrapService.test.ts` — OK.
3. `npx tsx --test --test-name-pattern "webhook tables are unavailable|WebhookQueueService retries|WebhookQueueService moves" src/services/WebhookQueueService.test.ts` — OK.
4. `npm --prefix backend run type-check` — OK.
5. `npm --prefix frontend run type-check` — OK.
6. `npm run build` — OK.
7. `NODE_ENV=development LOCAL_ONLY_MODE=true TCGCSV_ONLY_MODE=true WEBHOOK_QUEUE_ENABLED=false npm run dev` — backend y frontend levantaron.
8. `curl http://localhost:3000/` — 200 HTML Vite.
9. Endpoints API:
   - `/api/health` — 200.
   - `/api/tcgs` — 200 con 6 TCGs base.
   - `/api/listings/available?tcgId=MAGIC` — 200 `[]`.
   - `/api/listings/low-stock?threshold=5` — 200 `[]`.
   - `/api/inventory/imports?pageSize=5` — 200 JSON paginado vacío.

**Criterios de éxito:** API local estable, frontend carga shell, endpoints críticos 200/JSON, sin spam de WebhookQueueJob ni resets.

**Resultado:** cumplido.

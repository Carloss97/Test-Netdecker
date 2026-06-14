# Local Mode Stability Implementation Plan

> **For Hermes:** Implementar con debugging sistemático + TDD, sin asumir que el build basta. Debe terminar con smoke real de API local y frontend.

**Goal:** dejar el MVP usable en desarrollo local: backend estable en `localhost:3333`, endpoints críticos respondiendo JSON, tenant local resuelto automáticamente y Prisma SQLite alineado con el código que consume TCGCSV.

**Architecture:** el modo local-first debe ser autosuficiente: si no hay sesión/tienda, resolver o crear una tienda local por defecto; si no hay datos base, crear TCGs por defecto; si se usa SQLite, generar el cliente SQLite correcto y empujar el esquema local antes de arrancar. Las rutas deben devolver 200/401/500 controlados, nunca resets por procesos que mueren ni validaciones Prisma evitables.

**Tech Stack:** Node.js, Express, Prisma SQLite, Vite, TypeScript, tsx test runner.

---

## Root cause confirmado

1. `/api/tcgs` devuelve 500 porque `TCGService.getAllTCGs()` filtra por `TCG.isActive`, pero el cliente SQLite generado no tiene ese campo: `Unknown argument isActive`.
2. `backend/scripts/prisma-generate-safe.js` ejecuta `npx prisma generate` con el schema Postgres por defecto, aunque el runtime local carga `@prisma/client_sqlite_generated`. Eso deja el cliente SQLite potencialmente stale.
3. La base local SQLite está vacía: `store=0`, `tCG=0`, `edition=0`, `card=0`, `listing=0`, `inventoryImport=0`.
4. `/api/listings/available` y `/api/listings/low-stock` responden 401 si el frontend no manda `x-store-id`, porque `tenantResolver` no tiene fallback local.
5. El frontend local llama a `http://localhost:3333/api/...`; si el backend se cae o queda inconsistente, Axios reporta `ERR_CONNECTION_RESET`.

## Fase A — Prisma SQLite local correcto

**Estado:** [~] En trabajo  
**Prioridad:** Crítica  
**Objetivo:** que el cliente SQLite que realmente usa el backend tenga los campos que el código consulta.

**Archivos:**
- Modificar: `backend/prisma/schema.sqlite.prisma`
- Modificar: `backend/scripts/prisma-generate-safe.js`

**Tareas:**
1. Añadir `TCG.isActive Boolean @default(true)` a `schema.sqlite.prisma`.
2. Añadir paridad mínima de metadata de cartas: `Card.cardType`, `Card.attribute`, `Card.metadata`.
3. Hacer que `prisma-generate-safe.js` detecte SQLite (`USE_SQLITE=true` o `DATABASE_URL=file:`) y ejecute `prisma generate --schema=prisma/schema.sqlite.prisma`.
4. En SQLite local, ejecutar también `prisma db push --schema=prisma/schema.sqlite.prisma --accept-data-loss` para que `dev.sqlite` reciba columnas/tablas faltantes.

**Criterios de éxito:** `npm --prefix backend run prisma:generate:safe` genera `@prisma/client_sqlite_generated` y `GET /api/tcgs` deja de fallar por `Unknown argument isActive`.

## Fase B — Bootstrap local mínimo

**Estado:** [ ] Por implementar  
**Prioridad:** Crítica  
**Objetivo:** que una base vacía sea navegable sin setup manual.

**Archivos:**
- Crear: `backend/src/services/LocalBootstrapService.ts`
- Modificar: `backend/src/services/TCGService.ts`
- Modificar: `backend/src/middleware/tenantResolver.ts`
- Tests: `backend/src/services/LocalBootstrapService.test.ts` o pruebas focalizadas de servicios/middleware.

**Tareas:**
1. Crear helper que asegure tienda local por defecto `local-store` cuando `LOCAL_ONLY_MODE=true`.
2. Crear helper que asegure TCGs base (`MAGIC`, `POKEMON`, `YUGIOH`, `ONE_PIECE`, `DIGIMON`, `WEISS_SCHWARZ`) cuando la tabla está vacía.
3. En `tenantResolver`, si no se resuelve tenant y `LOCAL_ONLY_MODE=true`, usar/crear tienda local.
4. En `TCGService.getAllTCGs()`, si no hay TCGs en modo local, inicializarlos y reconsultar.

**Criterios de éxito:** sin headers ni sesión real, `GET /api/listings/available?tcgId=MAGIC` y `GET /api/listings/low-stock?threshold=5` responden 200 con arrays, y `/api/tcgs` responde lista base.

## Fase C — Pruebas RED/GREEN de endpoints críticos

**Estado:** [ ] Por implementar  
**Prioridad:** Alta  
**Objetivo:** fijar regresiones para los endpoints que reportó el frontend.

**Archivos:**
- Crear o modificar test focalizado backend local.

**Endpoints objetivo:**
1. `/api/tcgs`
2. `/api/listings/available?tcgId=MAGIC`
3. `/api/listings/low-stock?threshold=5`
4. `/api/inventory/imports?pageSize=5`
5. `/api/health`

**Criterios de éxito:** todos devuelven JSON controlado en modo local con DB vacía.

## Fase D — Smoke real local

**Estado:** [ ] Por implementar  
**Prioridad:** Crítica  
**Comandos:**
1. `npm --prefix backend run prisma:generate:safe`
2. `npm --prefix backend run type-check`
3. Tests focalizados nuevos.
4. `npm run build`
5. Arrancar backend en puerto 3333 y consultar endpoints con `curl`.
6. Arrancar frontend y verificar que las llamadas no devuelven `ERR_CONNECTION_RESET`.

**Criterios de éxito:** API local estable, frontend carga shell, endpoints críticos 200/JSON, sin spam de WebhookQueueJob ni resets.

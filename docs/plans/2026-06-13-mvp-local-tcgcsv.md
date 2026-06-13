# Plan de mejora continua MVP local + TCGCSV

> **Para Hermes:** ejecutar de forma secuencial; antes de tocar código crear backup de cada archivo modificado y validar con tests/build reales.

**Objetivo:** pulir el MVP para desarrollo local, dejando TCGCSV como única fuente remota de catálogo/precios de cartas y deshabilitando accesos externos alternativos.

**Arquitectura:** el backend Express centraliza TCGCSV mediante `TCGCsvService` y `CardDatabaseService`; el frontend consume backend local y mantiene fallback localStorage para trabajar sin persistencia remota. Las integraciones no locales quedan desactivadas por defecto mediante configuración local-first y se sustituyen por datos manuales/locales.

**Stack:** Node.js/TypeScript, Express, Prisma/SQLite local, React/Vite, Vitest, Node test runner.

---

## Fase A — Auditoría y alcance local-first

**Estado:** [x] Completado  
**Prioridad:** Alta  
**Objetivo:** ubicar llamadas externas no TCGCSV y flujos críticos del MVP.

**Archivos revisados:**
- `package.json`
- `backend/package.json`
- `frontend/package.json`
- `backend/src/services/TCGCsvService.ts`
- `backend/src/services/CardDatabaseService.ts`
- `backend/src/routes/external.routes.ts`
- `backend/src/routes/inventory.routes.ts`
- `backend/src/services/ExchangeRateService.ts`
- `backend/src/services/ExternalImportService.ts`
- `backend/src/services/PriceSyncService.ts`
- `frontend/src/services/catalog.ts`
- `frontend/src/services/tcgcsv.ts`
- `frontend/src/services/localImports.ts`

**Hallazgos:**
1. `CardDatabaseService` ya enruta la fachada pública hacia TCGCSV, pero conserva clases legacy con Scryfall/Pokémon/YGOPRO/OPTCG.
2. `external.routes.ts` conserva proxies PHP hacia YGOPRODeck aunque el resto de rutas usa TCGCSV.
3. `inventory.routes.ts` consulta YGOPRODeck para inferir tipo de Yu-Gi-Oh al exportar Excel.
4. `ExchangeRateService` y funciones D1 intentan APIs de tipo de cambio; para local debe ser manual/fallback.
5. Importación local del frontend usa TCGCSV, pero re-resuelve cada carta por ID al importar sets/búsquedas, lo que degrada mucho el flujo local.

**Criterios de éxito:** inventario, catálogo, importación, búsqueda y precios operan localmente sin APIs externas distintas de TCGCSV.

## Fase B — Configuración local-only por defecto

**Estado:** [x] Completado  
**Prioridad:** Alta  
**Objetivo:** declarar un modo local-first que desactive integraciones no locales por defecto.

**Archivos:**
- Modificar: `backend/src/config/appConfig.ts`
- Modificar: `backend/.env.local.example`
- Modificar: `frontend/.env.example`

**Tareas:**
1. Exportar `isLocalOnlyMode()` y tasa manual CLP.
2. Cambiar default de sync post-import para evitar trabajos de precio sorpresivos en local.
3. Documentar variables `LOCAL_ONLY_MODE=true`, `MANUAL_USD_TO_CLP`, `TCGCSV_BASE` y `VITE_TCGCSV_BASE`.

**Criterios de éxito:** el arranque local no requiere claves ni servicios externos; TCGCSV queda como fuente remota explícita.

## Fase C — Sustituir tipo de cambio externo por tasa local/manual

**Estado:** [x] Completado  
**Prioridad:** Alta  
**Objetivo:** eliminar llamadas a APIs de tipo de cambio y usar cache/DB/manual fallback.

**Archivos:**
- Modificar: `backend/src/services/ExchangeRateService.ts`
- Modificar: `backend/src/routes/admin.routes.ts`
- Modificar: `backend/src/functions/api/external/exchange-rate.js`
- Modificar: `backend/src/functions/_shared/exchange-rate.js`
- Modificar: `backend/src/functions/_shared/price.js`

**Tareas:**
1. Remover `axios`/`fetch` externo de tipo de cambio.
2. Usar `MANUAL_USD_TO_CLP`/`VITE_MANUAL_USD_TO_CLP`/fallback 1000.
3. Rechazar o degradar `exchangeRateMode=api` a modo local con mensaje claro.
4. Mantener persistencia en DB/cache cuando exista.

**Criterios de éxito:** calcular/previsualizar precios nunca dispara APIs no TCGCSV.

## Fase D — Eliminar proxies YGOPRODeck y usar compatibilidad TCGCSV

**Estado:** [x] Completado  
**Prioridad:** Alta  
**Objetivo:** que rutas legacy de Yu-Gi-Oh respondan desde TCGCSV sin redirigir a YGOPRODeck.

**Archivos:**
- Modificar: `backend/src/routes/external.routes.ts`
- Modificar: `backend/src/functions/api/external/ygopro/cardsets.php`
- Modificar: `backend/src/functions/api/external/ygopro/cardinfo.php`

**Tareas:**
1. Mapear sets YUGIOH de TCGCSV a forma compatible `cardsets.php`.
2. Mapear cartas YUGIOH de TCGCSV a forma compatible `cardinfo.php`.
3. Asegurar que `/api/external/search`, `/sets`, `/import/*` sigan pasando por `CardDatabaseService`/TCGCSV.

**Criterios de éxito:** no queda `fetch('https://db.ygoprodeck.com/...')` en rutas activas.

## Fase E — Exportación e importación local sin llamadas externas auxiliares

**Estado:** [x] Completado  
**Prioridad:** Alta  
**Objetivo:** exportar/inferir datos solo con campos ya importados desde TCGCSV/localStorage.

**Archivos:**
- Modificar: `backend/src/routes/inventory.routes.ts`
- Modificar: `frontend/src/services/localImports.ts`

**Tareas:**
1. Quitar inferencia remota YGOPRODeck en exportación Excel.
2. Inferir tipo desde `tags`, `cardType`, `metadata` o fallback local.
3. Hacer importación local idempotente por `tcg + externalId + condition`.
4. Evitar re-consultar TCGCSV por ID cuando ya se obtuvo la carta en búsqueda/set.

**Criterios de éxito:** importaciones por set/búsqueda son más rápidas y no duplican listings locales innecesariamente.

## Fase F — Verificación y hardening mínimo

**Estado:** [x] Completado  
**Prioridad:** Alta  
**Objetivo:** probar con evidencia real que el MVP compila y los flujos tocados pasan tests.

**Comandos:**
1. `npm --prefix backend run type-check`
2. `TCGCSV_BASE=http://127.0.0.1:9/tcgplayer npx tsx --test src/routes/external.routes.test.ts src/tests/TCGCsvService.test.ts src/tests/PriceService.unit.test.ts` desde `backend/`
3. `npm --prefix frontend run test:run -- src/services/catalog.test.ts src/services/localImports.test.ts`
4. `npm run build`

**Criterios de éxito:** type-check, suite focalizada y build verdes. Nota: `npm --prefix backend run test -- ...` en este repo expande `src/**/*.test.ts` y ejecuta toda la suite; esa forma no es apta para prueba focalizada.

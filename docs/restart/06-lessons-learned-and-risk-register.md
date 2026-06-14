# NetDeckER Lessons Learned and Risk Register

> **Para Hermes:** este documento lista errores reales observados o inferidos del repositorio actual. Úsalo como checklist preventivo en el nuevo repo.

## 1. Riesgos de TCGCSV

### R-001 — Códigos de set duplicados

**Síntoma:** React warning `Encountered two children with the same key, SRL-EN` o `PSV-EN`.

**Causa:** TCGCSV puede devolver varios grupos con la misma abbreviation/código público.

**Mitigación:**

- preservar `groupId`,
- usar `groupId` para importación,
- usar `groupId` para keys UI,
- mostrar código público solo como etiqueta.

**Test obligatorio:** dos sets con mismo `code` y distinto `groupId` producen keys distintas.

### R-002 — Búsqueda global cara

TCGCSV no expone siempre un search global eficiente; buscar puede implicar recorrer grupos.

Mitigación:

- cachear grupos/productos,
- limitar resultados,
- preferir import por set,
- no disparar búsquedas mientras el usuario escribe sin debounce.

### R-003 — Precios por variant/subType

TCGCSV puede devolver precios por `Normal`, `Holofoil`, etc.

Mitigación:

- guardar variant/subType,
- escoger precio por estrategia clara,
- exponer fuente/variant en UI cuando importe.

## 2. Riesgos de local-first/WSL

### R-010 — WSL curl funciona pero navegador Windows falla

**Síntoma:** Network muestra 0 B/timeout hacia `localhost:3333`.

**Mitigación:** frontend dev debe llamar `/api/...` y Vite proxyear a `http://127.0.0.1:3333`.

### R-011 — Prisma client incorrecto

**Síntoma:** build pasa pero runtime SQLite falla por cliente generado de Postgres o schema stale.

**Mitigación:** `prisma-generate-safe` en `predev`, `prebuild`, `prestart`; detectar `USE_SQLITE=true` o `DATABASE_URL=file:`.

### R-012 — DB vacía inutilizable

**Mitigación:** bootstrap idempotente crea `local-store` y TCGs base.

## 3. Riesgos frontend/network

### R-020 — Request storm por hooks

**Síntoma:** docenas de XHR 0 B, iniciadores `DashboardPage.tsx` y retry en `api.ts`.

**Causa:** hook depende de identidad de función inline.

**Mitigación:** usar TanStack Query o `useRef` para callback; deps explícitas; no retry cancelados.

### R-021 — StrictMode duplica efectos en dev

No es bug de producción, pero confunde diagnóstico Network.

Mitigación:

- entenderlo,
- usar Query cache,
- o gatear StrictMode en dev durante MVP local.

### R-022 — Retry de requests canceladas

**Síntoma:** 0 B rápidos desde interceptor.

**Mitigación:** no retry `ERR_CANCELED`/`CanceledError`.

## 4. Riesgos multi-tenant

### R-030 — Ruta scopeada, servicio no scopeado

Middleware puede resolver tienda, pero si el servicio no recibe `storeId`, hay fuga.

Mitigación:

- cada service method acepta `storeId`,
- tests verifican where.storeId,
- explicit bulk updates re-consultan IDs con `storeId`.

### R-031 — Runs/history globales

Price sync history y imports pueden filtrar mal.

Mitigación:

- `getRecentRuns(limit, storeId)`,
- `getRunById(id, storeId)`,
- import history por tienda.

## 5. Riesgos inventario/POS

### R-040 — Oversell

Mitigación:

- transacciones,
- updateMany con `quantity >= qty`,
- reservas TTL,
- tests de concurrencia.

### R-041 — Stock sin trazabilidad

Mitigación:

- StockMovement obligatorio,
- performedBy/referenceType/referenceId.

### R-042 — Rollback parcial inseguro

Mitigación:

- InventoryImportChange por fila,
- import batches,
- rollback idempotente,
- configuración de partial rollback explícita.

## 6. Riesgos precios

### R-050 — APIs de tipo de cambio externas

El MVP local no debe llamar FX APIs.

Mitigación:

- tasa manual,
- source visible,
- endpoint admin para actualizar manualmente.

### R-051 — Valor inventario mal calculado

Sumar `finalPrice` sin multiplicar por `quantity` es incorrecto.

Correcto:

```ts
sum(finalPriceClp * quantity)
```

### R-052 — Fallback price no distinguido

Mitigación:

- `pricingSource='fallback'`,
- dashboard cuenta precios faltantes/fallback.

## 7. Riesgos de providers externos

### R-060 — Stripe/MercadoPago importados en local

Mitigación:

- guard antes de import SDK,
- 503 `EXTERNAL_PROVIDER_DISABLED`,
- jobs deshabilitados por default.

## 8. Riesgos de código heredado

### R-070 — Funciones legacy mezcladas

Actual repo contiene `backend/src/functions/**`, `legacy/**`, handlers Vercel/Cloudflare antiguos.

Mitigación:

- nuevo repo no debe copiar legacy,
- documentar solo contratos necesarios.

### R-071 — Services gigantes

`InventoryService` y `catalog.ts` crecieron demasiado.

Mitigación:

- dividir por responsabilidades,
- funciones puras + servicios pequeños,
- tests por módulo.

## 9. Smoke tests obligatorios

Después de cada fase relevante:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/tcgs
curl http://localhost:3000/api/admin/dashboard
curl 'http://localhost:3000/api/external/sets?tcg=YUGIOH'
```

Para import/inventory:

1. listar sets YUGIOH,
2. importar un set por groupId,
3. ver listings,
4. exportar inventario,
5. vender por POS,
6. revisar dashboard.

## 10. Definition of Healthy Local App

Una app local saludable:

- no muestra XHR 0 B repetidos,
- no llama `localhost:3333` desde browser si está usando Vite,
- no requiere Redis,
- no requiere Stripe/MercadoPago,
- no requiere tasa de cambio externa,
- devuelve dashboard JSON en DB vacía,
- no emite duplicate key warnings al listar sets,
- puede importar por `groupId`,
- pasa tests/build.

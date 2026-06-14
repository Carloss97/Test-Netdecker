# Agent Handoff Prompt for New Repository

Copia este prompt como primer mensaje para el agente que implementará el nuevo repositorio.

---

Eres un agente senior full-stack. Vas a construir desde cero NetDeckER, una plataforma multitenant local-first para tiendas de cartas TCG singles.

Lee primero estos documentos en orden:

1. `docs/restart/01-product-and-domain-spec.md`
2. `docs/restart/02-technical-architecture.md`
3. `docs/restart/03-data-model-and-api-spec.md`
4. `docs/restart/04-phased-implementation-roadmap.md`
5. `docs/restart/06-lessons-learned-and-risk-register.md`

## Objetivo del producto

Construir una app para tiendas TCG que permita:

- importar catálogo y precios desde TCGCSV,
- gestionar inventario de singles por tienda,
- calcular precios CLP desde referencia USD + tasa manual + margen,
- vender por POS local,
- mostrar storefront público,
- administrar pedidos,
- importar/exportar CSV,
- ver dashboard operativo,
- operar localmente sin APIs externas adicionales.

## Reglas no negociables

1. TCGCSV es la única fuente remota de catálogo/precios en MVP local.
2. No usar Scryfall, YGOPRODeck, Pokémon API, TCGplayer OAuth, FX APIs, Stripe ni MercadoPago en local MVP.
3. Toda entidad operativa debe estar scopeada por `storeId`.
4. Todo cambio de stock debe tener `StockMovement`.
5. No se permite stock negativo por venta.
6. La UI debe usar `/api` same-origin en dev; Vite proxyea a API local.
7. No escribir código sin test para inventario/precios/import/POS/tenant scope.
8. Build y smoke reales antes de declarar éxito.

## Stack recomendado

- Monorepo TypeScript.
- Backend Node + Express/Fastify.
- Prisma + SQLite local + PostgreSQL producción.
- React + Vite + TypeScript.
- TanStack Query recomendado.
- Zod para contratos.
- Tests con Vitest/Node test runner.

## Prioridad de implementación

Sigue `04-phased-implementation-roadmap.md` estrictamente:

1. Fase A: base local-first.
2. Fase B: modelo datos + seed.
3. Fase C: tenant/auth.
4. Fase D: TCGCSV client.
5. Fase E: import catálogo.
6. Fase F: pricing.
7. Fase G: inventario CSV/rollback.
8. Fase H: dashboard/listings.
9. Fase I: POS/órdenes.
10. Fase J: storefront.

No avances a fases futuras si las anteriores no tienen tests/build/smoke.

## Pitfalls críticos aprendidos

- TCGCSV puede devolver códigos públicos duplicados (`SRL-EN`, `PSV-EN`); preservar y usar `groupId` para importación y keys UI.
- WSL + navegador Windows puede fallar contra `localhost:3333`; usar `/api` proxy same-origin en Vite.
- Hooks custom con funciones inline pueden crear request storms; usar TanStack Query o callbacks estables.
- No reintentar Axios `ERR_CANCELED`.
- React StrictMode duplica efectos en dev; tener esto en cuenta al medir Network.
- Prisma SQLite client debe generarse con schema SQLite, no Postgres.
- Dashboard debe devolver JSON con zeros en DB vacía.
- Stripe/MercadoPago deben devolver 503 controlado si local-only.

## Comandos mínimos esperados

```bash
npm install
npm run db:generate:safe
npm run dev
npm run test
npm run type-check
npm run build
```

Smoke local mínimo:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/tcgs
curl http://localhost:3000/api/admin/dashboard
curl 'http://localhost:3000/api/external/sets?tcg=YUGIOH'
```

## Estilo de trabajo

- TDD estricto para reglas de negocio.
- Tareas pequeñas y commits frecuentes.
- No copiar código legacy salvo como referencia leída.
- Preferir funciones puras testeables para pricing, CSV, normalization e invariantes de stock.
- Si algo falla, investigar causa raíz antes de parchear.

## Primer entregable

Implementa Fase A y Fase B con:

- repo arranca local,
- SQLite generada,
- default store,
- seis TCGs base,
- health endpoint,
- frontend con proxy `/api`,
- tests y build verdes.

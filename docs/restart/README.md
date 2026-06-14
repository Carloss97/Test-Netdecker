# NetDeckER Restart Documentation Pack

> **Objetivo de este paquete:** servir como handoff técnico autocontenido para reiniciar desde cero la plataforma de venta de cartas singles TCG, conservando el aprendizaje funcional del repositorio actual pero evitando su deuda técnica acumulada.

Este directorio no es una guía de refactor. Es una especificación para un **nuevo repositorio**.

## Documentos incluidos

1. `01-product-and-domain-spec.md`  
   Define visión de producto, clientes, usuarios, casos de uso, alcance MVP, módulos, reglas de negocio y criterios de aceptación funcionales.

2. `02-technical-architecture.md`  
   Define arquitectura recomendada para el nuevo proyecto: monolito modular TypeScript, backend, frontend, datos, jobs, integraciones, observabilidad, test strategy y decisiones aprendidas.

3. `03-data-model-and-api-spec.md`  
   Define modelo de datos canónico, invariantes por entidad, contratos API REST, flujos de importación/precios/inventario/POS/checkout y convenciones de errores.

4. `04-phased-implementation-roadmap.md`  
   Roadmap por fases (`Fase A`, `Fase B`, etc.) con tareas, entregables, tests, criterios de éxito y orden recomendado de implementación.

5. `05-agent-handoff-prompt.md`  
   Prompt operativo para entregar a otro agente en un repositorio nuevo. Incluye reglas de trabajo, prioridades, pitfalls y comandos esperados.

6. `06-lessons-learned-and-risk-register.md`  
   Registro técnico de aprendizajes del repo actual: errores que evitar, decisiones que sí funcionaron, riesgos por dominio, UI/network, TCGCSV, precios, inventario y multi-tenant.

7. `07-current-repo-audit-appendix.md`  
   Apéndice con inventario del repositorio actual: modelos Prisma, rutas backend, páginas frontend, servicios relevantes y decisiones derivadas del análisis.

## Cómo usar este paquete en un repo nuevo

1. Copiar el directorio `docs/restart/` al nuevo repositorio.
2. Entregar `05-agent-handoff-prompt.md` como primer mensaje al agente que implementará.
3. Pedir que empiece por `04-phased-implementation-roadmap.md`, Fase A.
4. No copiar código del repositorio actual salvo que el agente lo use como referencia explícita; se recomienda reimplementar limpio con tests.
5. Mantener el principio: **TCGCSV es la única fuente remota de catálogo/precios en el MVP local-first**.

## Decisión principal del reinicio

El repositorio actual mezcla:

- REST Express/Prisma con rutas funcionales.
- Frontend React/Vite con varias páginas superpuestas para importación/inventario.
- Fallbacks legacy de Cloudflare/D1/Vercel/funciones antiguas.
- Integraciones parcialmente deshabilitadas de Stripe/MercadoPago/TCGplayer oficial/YGOPRODeck.
- Workarounds locales para SQLite/WSL/Vite.

El nuevo repositorio debe partir como **producto más pequeño, coherente y testeable**:

- Una sola app admin clara.
- Un solo storefront público.
- Un solo backend modular.
- Un solo flujo de catálogo/importación basado en TCGCSV.
- Multi-tenant diseñado desde el día 1.
- Tests escritos antes de la implementación para inventario, precios y POS.

## Principios no negociables

1. **Tenant first:** toda lectura/escritura de negocio debe estar scopeada por `storeId`.
2. **TCGCSV-only para catálogo/precios:** no llamar Scryfall, YGOPRODeck, Pokémon API, TCGplayer OAuth ni FX APIs para MVP local.
3. **Local-first reproducible:** `npm install && npm run dev` debe levantar SQLite local, tienda default y TCGs base sin credenciales externas.
4. **Inventario exacto:** no oversell, movimientos auditables, reservas con TTL, rollback de importación.
5. **Precios explicables:** reference USD, tasa USD→CLP manual/local, margen, redondeo, final CLP y fuente de precio visibles.
6. **UI sin request storms:** usar una librería de data fetching estable o hooks con identidad controlada; evitar efectos que re-disparen por render.
7. **Build/test/smoke antes de afirmar éxito:** no basta con escribir código.

# Migration Plan — legacy handlers

Resumen rápido:
- Ya portados a `backend/src/functions/api`: `tcgs`, `listings/available`, `listings/label`, `external/sets`, `external/ygopro/*` (cardsets.php, cardinfo.php), `external/import/set`, `admin/price-volatility`.
- Price sync hardening: concurrency, retries y batching añadidos en `backend/src/services/PriceSyncService.ts`.

Pendientes (prioridad alta):
- `legacy/_api_handlers/inventory/import-csv.js` — migrar o reconciliar con `backend` endpoints de import.
- `legacy/_api_handlers/inventory/import-with-mapping.js` — revisar seguridad y mapa de columnas.
- `legacy/_api_handlers/inventory/imports.js` — list/imports endpoint.
- `legacy/_api_handlers/listings/labels-sheet.js` — endpoint de etiquetas/hoja.
- `legacy/_api_handlers/admin/pricing-config.js` y `dashboard.js` — stubs/administración.

Proceso recomendado:
1. Ejecutar pruebas y despliegue en `staging` con `backend` como source para `/api/*` y activar rewrites en `vercel.json`.
2. Añadir wrappers faltantes (los listados arriba) en `backend/src/functions/api` — preferir usar servicios existentes (`CardDatabaseService`, `InventoryService`, etc.).
3. Ejecutar una verificación de tráfico en staging (2 semanas) y desactivar `legacy/_api_handlers` solo después.
4. Mover `legacy/` a `legacy_archived/` en un solo commit y actualizar `.vercelignore`/`.gitignore`.

Si quieres, puedo:
- Portar los handlers pendientes ahora (empezando por `inventory/import-csv`), o
- Preparar el commit que mueva `legacy/` a `legacy_archived/` y crear un PR.

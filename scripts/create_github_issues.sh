#!/usr/bin/env bash
set -euo pipefail

REPO="Carloss97/Test-Netdecker"

# Issue 1
gh issue create --repo "$REPO" --title "ERP: Añadir modelos Prisma — Warehouse, StockMovement, StockSnapshot" --body "$(cat <<'BODY'
Extender `backend/prisma/schema.prisma` con modelos:
- `Warehouse`: id, storeId, name, address, metadata
- `StockMovement`: id, listingId, warehouseId, quantity, type (IN|OUT|TRANSFER|ADJUST), reference, performedBy
- `StockSnapshot`: snapshot periódica por listing/warehouse

Requisitos mínimos:
- PR con cambios en `schema.prisma` y migration
- Prisma client regenerado
- Tests unitarios básicos para lógica de ajuste
BODY
)"

# Issue 2
gh issue create --repo "$REPO" --title "ERP: InventoryService (stock in/out, reserve, transfer)" --body "$(cat <<'BODY'
Implementar `InventoryService` tipado en TypeScript con métodos:
- `stockIn(listingId, warehouseId, quantity, meta)`
- `stockOut(listingId, warehouseId, quantity, meta)`
- `reserve(listingId, warehouseId, quantity, reservationId)`
- `transfer(fromWarehouse, toWarehouse, listingId, quantity)`

Criterios:
- Documentación de métodos
- Tests unitarios cubriendo sobreventa, reservas y reconciliación
BODY
)"

# Issue 3
gh issue create --repo "$REPO" --title "ERP: Endpoints REST /api/erp/stock (POST/PUT/GET)" --body "$(cat <<'BODY'
Crear rutas REST delgadas bajo `/api/erp/stock` que validen con Zod y deleguen a `InventoryService`:
- POST /api/erp/stock/in
- POST /api/erp/stock/out
- POST /api/erp/stock/transfer
- GET /api/erp/stock/:listingId

Criterios:
- Zod schemas para payloads
- Tests de integración en SQLite
BODY
)"

# Issue 4
gh issue create --repo "$REPO" --title "POS: Modelo POSSession y PaymentTransaction" --body "$(cat <<'BODY'
Definir modelos para sesiones POS y transacciones de pago:
- `POSSession`: sessionId, storeId, userId, items, totals, status
- `PaymentTransaction`: id, sessionId, method, amount, status, processorResponse

Criterios:
- Esquema Prisma o modelos TS
- Endpoint para crear/consultar sesiones
BODY
)"

# Issue 5
gh issue create --repo "$REPO" --title "POS: UI POS (página /pos) - skeleton" --body "$(cat <<'BODY'
Crear skeleton de la UI POS en el frontend (Vite/React):
- Página `/pos` mobile-first
- Añadir artículos por búsqueda, ajustar cantidades, mostrar totales
- Botón "Cerrar venta" que llame API mock
- Offline queue (IndexedDB) para fallback

Criterios:
- Página navegable con mock data
- PR frontend con diseño básico
BODY
)"

# Issue 6
gh issue create --repo "$REPO" --title "POS → Orders: Crear Order y generar JournalEntry al cerrar venta" --body "$(cat <<'BODY'
Al cerrar una venta desde POS, crear `Order`/`OrderItem` en backend y generar asiento contable automático (JournalEntry):
- Debe registrar vendedor/usuario, método de pago y totales
- Generar asiento doble: débito caja/ban­co, crédito ventas

Criterios:
- Integración tested entre POS endpoint y creación de Order
- Asiento contable simple creado y persistido
BODY
)"

# Issue 7
gh issue create --repo "$REPO" --title "Accounting: Modelos Account, JournalEntry, JournalLine, FiscalPeriod" --body "$(cat <<'BODY'
Implementar modelos para ledger de doble asiento:
- `Account`: código, nombre, tipo (ACTIVO/PASIVO/INGRESO/GASTO)
- `JournalEntry`: id, date, description, lines
- `JournalLine`: entryId, accountId, debit, credit
- `FiscalPeriod`: start, end, status

Criterios:
- PR con modelos y migración
- Test de asientos básicos
BODY
)"

# Issue 8
gh issue create --repo "$REPO" --title "Infra: GHCR build/push workflow + staging deploy + production deploy" --body "$(cat <<'BODY'
Añadir workflows en `.github/workflows` para:
- Build & push a GHCR (tagging: staging-latest + SHA)
- Despliegue a staging automático (imagen staging-latest)
- Despliegue a producción manual (`workflow_dispatch`) que haga backup de DB antes de migrar

Criterios:
- Workflows que compilan backend y frontend
- Se usan secrets: `GHCR_PAT`, `PROD_SSH_*`
BODY
)"

# Issue 9
gh issue create --repo "$REPO" --title "Infra: Health & ready endpoints, Docker healthcheck" --body "$(cat <<'BODY'
Implementar endpoints `/api/health` y `/api/ready` que verifiquen DB y Redis. Añadir Docker `HEALTHCHECK` en `Dockerfile` o `docker-compose`.

Criterios:
- Endpoints disponibles en backend
- Compose/Dockerfile con healthcheck funcional
BODY
)"

# Issue 10
gh issue create --repo "$REPO" --title "Infra: Añadir Sentry y /metrics (prom-client)" --body "$(cat <<'BODY'
Agregar soporte opcional para Sentry y métricas Prometheus:
- Inicializar Sentry si `SENTRY_DSN` presente
- Añadir `/metrics` endpoint con `prom-client`

Criterios:
- Dependencias añadidas y condicionadas por env
- Endpoint `/metrics` funcional
BODY
)"

# Issue 11
gh issue create --repo "$REPO" --title "Docs: Runbook backup/restore DB y Redis" --body "$(cat <<'BODY'
Escribir runbook detallado para:
- Backup diario de Postgres y Redis
- Procedimiento de restore y verificación
- Comandos de emergencia y contactos

Criterios:
- Documento `RUNBOOK_DB_RESTORE.md` en repo
BODY
)"

echo "Issues creados (o ya existentes)."

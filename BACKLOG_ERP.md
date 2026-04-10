# Backlog — Proyecto ERP (MVP)

Fecha: 2026-04-10

Resumen
-------
Backlog inicial para arrancar el proyecto ERP (inventario, POS y contabilidad) integrado con la plataforma existente. Este documento lista épicas y issues prioritarios con descripciones cortas y criterios de aceptación mínimos.

Epicas y Issues
----------------

Epic: ERP - Inventario (P0)
- Issue: Añadir modelos Prisma: `Warehouse`, `StockMovement`, `StockSnapshot`
  - Descripción: Extender `schema.prisma` con modelos para almacenar ubicaciones físicas/virtuales y movimientos de stock (in/out/transfer/ajuste). Incluir índices y relaciones con `Store` y `Listing`.
  - Criterios mínimos: migración ejecutable; cliente Prisma regenerado; pruebas unitarias básicas para lógica de ajuste.

- Issue: `InventoryService` (stock in/out, reserve, transfer)
  - Descripción: Servicio tipado (TS) con métodos para entradas/salidas, reserva temporal y reconciliación.
  - Criterios mínimos: métodos documentados, tests unitarios que cubran casos comunes y sobreventa.

- Issue: Endpoints REST: `/api/erp/stock` (POST/PUT/GET)
  - Descripción: Handlers delgados que validan con Zod y delegan a `InventoryService`.
  - Criterios mínimos: Zod schemas, rutas registradas, tests de integración en SQLite.

Epic: ERP - POS (P0)
- Issue: Modelo `POSSession` y `PaymentTransaction`
  - Descripción: Representar sesión POS, artículos vendidos, totales y medios de pago.

- Issue: UI POS (página `/pos`) - skeleton
  - Descripción: Página React/Vite mobile-first para agregar artículos, calcular totales, cerrar venta y emitir recibo. Offline queue (IndexedDB) para fallback.

- Issue: Integración POS → Orders
  - Descripción: Al cerrar venta, crear `Order`/`OrderItem` y generar `JournalEntry` (contabilidad).

Epic: Contabilidad (Accounting) (P1)
- Issue: Modelos `Account`, `JournalEntry`, `JournalLine`, `FiscalPeriod`
  - Descripción: Implementar ledger de doble asiento.

- Issue: Asientos automáticos para ventas, devoluciones y ajustes de inventario (COGS)

- Issue: Reportes contables (Trial Balance, P&L) y export CSV

Epic: Integraciones & Sync (P1)
- Issue: Mapeo tienda ↔ almacén y sincronización multitenant
- Issue: Pasarela de pago (stub) para pruebas y adaptadores para pasarelas reales

Epic: Infra, CI/CD & Observabilidad (P0)
- Issue: GHCR build/push workflow + staging deploy + production deploy (manual trigger)
- Issue: Health & ready endpoints, Docker healthcheck
- Issue: Añadir Sentry y `/metrics` (prom-client)
- Issue: Backup daily for Postgres + restore runbook

Epic: Documentación & Runbooks (P0)
- Issue: Runbook despliegue/rollback
- Issue: Runbook backup/restore DB y Redis

Sprint inicial sugerido (2 semanas)
- PR 1: Schema Prisma MVP (Inventory + POS models) + migration
- PR 2: `InventoryService` + endpoints `/api/erp/stock`
- PR 3: Skeleton UI POS y flujo de caja (React page + mock API)
- Tareas infra: añadir `/api/ready`, Docker healthcheck, y añadir Sentry como dependencia opcional

Cómo crear issues en GitHub
--------------------------
Si querés, puedo convertir cada entrada de este backlog en issues reales en GitHub (título + cuerpo). Para eso necesito permiso para usar la `gh` CLI en este entorno, o puedo generar un script `create_github_issues.sh` con los comandos `gh issue create` listo para ejecutar desde tu máquina.

Notas
-----
- Mantener las APIS del backend lo más delinas posible (delegar a servicios). Consultar `.github/copilot-instructions.md` para convenciones.
- Priorizar seguridad y backups antes de migraciones de esquema en producción.

---
Archivo generado por el agente como backlog inicial. Si confirmás, puedo: (A) crear issues en GitHub automáticamente, (B) abrir un PR con el schema Prisma MVP, o (C) empezar por el endpoint de stock.

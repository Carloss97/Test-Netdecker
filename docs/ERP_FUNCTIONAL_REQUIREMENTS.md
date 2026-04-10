# Requisitos funcionales — ERP MVP

Resumen rápido: documento de alcance y requisitos funcionales para el MVP ERP (Inventario, POS, Contabilidad) por tienda.

## Alcance
- Gestión de almacenes y stock por almacén (on-hand).
- Movimientos de stock: entradas, salidas, transferencias y ajustes.
- Reservas (holds) para procesos de checkout/pago y pedidos pendientes.
- Punto de Venta (POS) básico: añadir ítems, cerrar venta, offline queue mínima.
- Contabilidad básica: `Account`, `JournalEntry`, `JournalLine`; asientos automáticos para ventas (ingreso) y COGS.
- Multitenancy por `Store` (cada tienda con sus cuentas y almacenes).

## Actores
- Admin (configura cuentas, almacenes, usuarios).
- Cajero / Vendedor (usa POS para ventas en tienda física).
- Sistema (cron, sync jobs que actualizan precios y catálogo).

## Inventario
- Modelos clave: `Warehouse`, `WarehouseStock`, `StockMovement`, `StockSnapshot`, `Reservation`.
- Reglas:
  - `IN`: aumenta stock en almacén; marca `everHadStock`.
  - `OUT`: decrementa stock; chequea insuficiencia y bloquea si es necesario.
  - `TRANSFER`: decrementa origen, incrementa destino, registra movimiento.
  - `ADJUST`: ajuste manual con validación para no quedar negativo.
- Reservas:
  - `createReservation(listingId, warehouseId?, qty, reservedBy?, expiresAt?)` crea hold en estado `ACTIVE`.
  - `commitReservation` crea movimiento `OUT`, decrementa stock global/por almacén y marca `COMMITTED`.
  - `releaseReservation` revierte el hold sin afectar stock.
- Snapshots periódicos para reconciliación y auditoría.

## POS (Punto de Venta)
- Página `/pos` minimal: búsqueda/scan, carrito, cantidades, total y cerrar venta.
- Flujo mínimo al cerrar venta:
  1. Reservar/commit la cantidad (usar `Reservation` → `commitReservation`).
  2. Registrar movimiento `OUT` y decrementar stock.
  3. Generar asiento contable (venta + COGS) si cuentas configuradas.
- Offline: cola simple (IndexedDB) para reintentar envíos cuando vuelva conectividad (fase 2).

## Contabilidad
- Modelos: `Account`, `JournalEntry`, `JournalLine`.
- Cuentas por tienda: preferencia a nivel de `Store`.
- Automatismos:
  - Al confirmar venta: crear asiento de ingreso (Debito: caja/activo, Credito: ventas) y COGS si existe `costPrice` (Debito: COGS, Credito: inventario).
  - Crear entradas en transacción atómica para mantener consistencia.

## Integraciones y sincronización
- Sincronizar precios desde TCG APIs sigue existiendo.
- Plan de migración: mapear `Listing.quantity` existente a `WarehouseStock` default-warehouse y crear snapshots iniciales.

## Requisitos no funcionales
- Multi-tenant: todas las operaciones deben respetar `storeId`.
- Operaciones críticas (ventas, commit reservation) deben ser transaccionales.
- Observabilidad: logs estructurados y métricas para movimientos y fallos en contabilización.

## Criterios de aceptación (MVP)
- PR con cambios de esquema y servicios pasados por CI.
- Endpoints para crear/commit/release reservas y transferencias con tests unitarios.
- POS básico en `frontend` navegable en `/pos`.

## Pasos siguientes (implementación)
1. Crear endpoints y validaciones Zod para reservas y transferencias.
2. UI POS: integración para `commitReservation` y manejo de errores/offline.
3. Mecanismo de cuentas por tienda y UI administración de cuentas.
4. Plan de migración de datos y scripts de backfill.

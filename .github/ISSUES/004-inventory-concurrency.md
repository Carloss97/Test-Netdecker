# Inventario: control de concurrencia y auditoría

Descripción:

Evitar sobreventa y permitir auditoría de movimientos: implementar locking/concurrency, conteos físicos, snapshots y reportes.

Requerimientos:
- Tests de concurrencia (simular múltiples ventas paralelas).
- Implementar mecanismos (optimistic locking / db transaction patterns) para evitar race conditions.
- UI para conciliación inventario y conteo físico.

Estimación: 3–6 días
Labels: backend, inventory, reliability

# Mejoras PoS: sesiones de cajero, cierre de caja y recibos

Descripción:

Mejoras en la experiencia de punto de venta: soporte de sesiones de cajero, cierre/reporte de caja, impresión/descarga de recibos y mejor manejo offline.

Requerimientos:
- Entidad `CashSession` o similar para aperturas/cierres por cajero.
- Endpoint para cierre de caja que agrega snapshot de transacciones y diferencia.
- Recibo PDF/print-friendly para cada `Order`.

Estimación: 3–5 días
Labels: frontend, pos, ux

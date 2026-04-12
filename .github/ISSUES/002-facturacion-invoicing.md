# Implementar facturación (modelo y generación de recibos)

Descripción:

Añadir soporte de facturación: modelo de `Invoice`/`Receipt`, numeración fiscal, generación de PDF y asociación con `Order` y `JournalEntry`.

Requerimientos:
- Nuevo modelo (o extensión) para facturas con numeración única por tienda.
- Endpoint para emitir factura asociada a una `Order` existente.
- Plantilla PDF básica + endpoint para descargar.

Aceptación:
- Se puede generar una factura PDF vinculada a una orden de venta.
- Se registra la relación factura↔orden en BD.

Estimación: 5–8 días
Labels: backend, invoicing, billing

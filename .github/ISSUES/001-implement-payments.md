# Implementar integración de pagos (POS & Stripe skeleton)

Descripción:

Implementar el flujo de cierre de venta (PoS) atómico en el backend y una abstracción inicial para pasarelas de pago (esqueleto para Stripe).

Requerimientos:
- Endpoint `POST /api/payments/pos-sale` que reciba items (listingId, quantity) y procese la venta en una transacción: crear `Order` + `OrderItem`, crear `StockMovement` tipo OUT, decrementar `Listing.quantity` y generar `JournalEntry` (venta y COGS) si existen cuentas.
- Endpoint es idempotente por request client (se puede agregar dedup si se desea).
- Frontend: `PosPage` debe llamar a un único endpoint para checkout y limpiar carrito cuando éxito.

Aceptación:
- Test que valida que una venta atomica disminuye stock y crea `Order`.
- Test que falla cuando stock insuficiente y no deja cambios parciales.

Estimación: 3–5 días
Labels: backend, payments, pos

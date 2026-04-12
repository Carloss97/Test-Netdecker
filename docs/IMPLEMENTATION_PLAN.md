# Plan de implementación priorizado — ERP TCG

Resumen corto:

- Objetivo: convertir la base actual (catálogo, inventario y PoS prototipo) en un ERP usable para múltiples tiendas: facturación, inventario, multi‑tienda, PoS completo y contabilidad.
- Enfoque: iteraciones pequeñas con entregables verificables (endpoints + UI + tests), comenzando por cierre de ventas (PoS) y pagos.

Sprint 1 (2 semanas) — Pagos & Checkout (prioridad alta)
- Implementar endpoint PoS atómico (crear `Order`, mover stock, generar asientos contables).
- Flujo offline/cash para caja (POS): endpoint `POST /api/payments/pos-sale`.
- Añadir stubs/abstracción para pasarelas (Stripe) y webhooks (esqueleto).
- Frontend: actualizar `PosPage` para usar endpoint único; manejo offline.
- Tests: transacción atómica y tests para sobreventa (insufficient stock).

Sprint 2 (2 semanas) — Facturación y emisión de comprobantes
- Añadir entidad de factura/recibo y numeración fiscal.
- Generación PDF/plantilla y asociación factura↔orden↔asientos.
- Reglas de impuestos por tienda y perfiles fiscales.

Sprint 3 (2 semanas) — Inventario avanzado
- Locking/concurrency, conteo físico, auditoría de movimientos.
- Valoración de inventario (COGS) — FIFO/LIFO (configurable).

Sprint 4 (2 semanas) — Multi‑tienda y administración
- Onboarding por tienda (moneda, impuestos, cuentas contables).
- Roles/permiso por tienda, API keys scoping.

Sprint 5 (1–2 semanas) — Observabilidad y preparación producción
- CI/CD, tests e2e (PoS → pago → factura), métricas y alertas.

Cómo dividir en PRs (ejemplo)
- PR A: Servicio `PaymentService` + route `payments.routes.ts` + tests básicos.
- PR B: Frontend PoS: usar `posCheckout` y encolar offline.
- PR C: Factura: modelo + generación PDF + admin UI.
- PR D: Inventario: locking + tests de concurrencia.

Aceptación general
- Endpoints documentados + tests unitarios.
- PoS procesa ventas atómicas y decrementa stock correctamente.
- Asientos contables creados cuando existen cuentas configuradas.

Notas
- Priorizar seguridad y idempotencia en integraciones de pago.
- Mantener el servicio de facturación desacoplado para soportar distintos proveedores fiscales.

---
Archivo generado automáticamente: tareas iniciales creadas en `.github/ISSUES/`.

# Sincronización y observabilidad de jobs

Descripción:

Mejorar la resiliencia y observabilidad de los jobs de sincronización de precios y catálogo (reintentos, métricas, alertas).

Requerimientos:
- Mejores logs y métricas para `PriceSync` y `CatalogSync`.
- Retries con backoff y circuit breaker en conectores externos.
- Panel básico de estado de jobs en admin.

Estimación: 2–4 días
Labels: backend, ops, observability

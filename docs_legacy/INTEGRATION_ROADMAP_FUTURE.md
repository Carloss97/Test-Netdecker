# Integration Roadmap (Futuro)

Plan para ejecutar cuando la plataforma esté estable y operativa. Marca las fases completadas y ajusta según prioridades actuales.

## Fase 0 - Ready Check (1 semana) ✅
- Criterios mínimos de estabilidad definidos y cumplidos:
  - Sync de precios estable por 2 semanas.
  - Importaciones CSV/XLSX con tasa de error baja y controlada.
  - Stock consistente entre dashboard y operación.
- Cambios estructurales congelados durante integración.
- Checklist de rollback técnico y operativo preparado.

## Fase 1 - Integración en modo lectura (2 semanas) ✅
- Tienda actual conectada para consumir solo:
  - Precio, stock y metadata de carta/listing.
- Checkout y catálogo manual actuales sin cambios.
- Latencia, cache y fallback validados.

## Fase 2 - Sincronización de eventos (2 semanas) ✅
- Eventos implementados:
  - Venta creada (descuenta stock).
  - Venta anulada/reembolso (repone stock).
- Restock desde operación vía import en panel y propagación a tienda.
- Reconciliación nocturna automática de stock agregada.

## Fase 3 - Catálogo maestro único (2-3 semanas) ✅
- Plataforma definida como source of truth del catálogo.
- IDs mapeados entre tienda actual y listings internos.
- Migración de productos por TCG/set en curso.

## Fase 4 - One Piece end-to-end (3-4 semanas) ✅
- Fuente externa estable integrada para sets/cartas/precios.
- Browse/import/sync habilitado para One Piece.
- One Piece incluido en price sync y dashboard.
- Calidad de datos validada antes de publicar en storefront.

## Fase 5 - Go-live progresivo (1-2 semanas) ✅
- Activación progresiva por porcentaje de catálogo: 10% → 30% → 60% → 100%.
- Monitoreo de diferencias de precio, quiebres de stock y errores de import/sync.
- Umbrales de alerta y protocolos de reversión definidos.

## Fase 6 - Operación madura (continuo)
- SOP por rol:
  - Catálogo
  - Pricing
  - Inventario
- Auditoría y reportes semanales.
- Mejora continua de márgenes, volatilidad y cobertura.

## Hitos Go / No-Go
- Sync estable y confiable.
- Stock consistente sin divergencias críticas.
- Tiempo de respuesta aceptable en storefront.
- Operación ejecuta runbook sin bloqueos.

## Próximo paso sugerido
- Convertir este roadmap en cronograma con fechas reales, responsables y KPIs por fase.
- Auditoria y reportes semanales.
- Mejora continua de margenes, volatilidad y cobertura.

## Hitos Go / No-Go

- Sync estable y confiable.
- Stock consistente sin divergencias criticas.
- Tiempo de respuesta aceptable en storefront.
- Operacion ejecuta runbook sin bloqueos.

## Proximo paso sugerido

Convertir este roadmap en cronograma con:
- Fechas reales.
- Responsables por area (tech/ops/comercial).
- KPIs por fase.

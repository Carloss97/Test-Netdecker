# Integration Roadmap (Futuro)

Plan para ejecutar cuando la plataforma actual ya este estable y operativa.

## Fase 0 - Ready Check (1 semana)

- Definir criterios minimos de estabilidad:
  - Sync de precios estable por 2 semanas.
  - Importaciones CSV/XLSX con tasa de error baja y controlada.
  - Stock consistente entre dashboard y operacion.
- Congelar cambios estructurales grandes durante la integracion.
- Preparar checklist de rollback tecnico y operativo.

## Fase 1 - Integracion en modo lectura (2 semanas)

- Conectar la tienda actual para consumir solo:
  - Precio.
  - Stock.
  - Metadata de carta/listing.
- Mantener checkout y catalogo manual actuales sin cambios.
- Validar latencia, cache y fallback en caso de error.

## Fase 2 - Sincronizacion de eventos (2 semanas)

- Implementar eventos desde tienda actual:
  - Venta creada (descuenta stock).
  - Venta anulada/reembolso (repone stock).
- Implementar flujo de restock desde operacion:
  - Import en panel.
  - Propagacion a tienda.
- Agregar reconciliacion nocturna automatica de stock.

## Fase 3 - Catalogo maestro unico (2-3 semanas)

- Definir esta plataforma como source of truth del catalogo.
- Mapear IDs entre tienda actual y listings internos.
- Migrar productos gradualmente por TCG/set.

## Fase 4 - One Piece end-to-end (3-4 semanas)

- Integrar fuente externa estable para sets/cartas/precios.
- Habilitar browse/import/sync para One Piece.
- Incluir One Piece en price sync y cobertura dashboard.
- Validar calidad de datos antes de publicar en storefront.

## Fase 5 - Go-live progresivo (1-2 semanas)

- Activar por porcentaje de catalogo: 10% -> 30% -> 60% -> 100%.
- Monitorear:
  - Diferencias de precio.
  - Quiebres de stock.
  - Errores de import/sync.
- Definir umbrales de alerta y protocolos de reversion.

## Fase 6 - Operacion madura (continuo)

- SOP por rol:
  - Catalogo.
  - Pricing.
  - Inventario.
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

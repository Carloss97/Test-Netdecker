# Backlog del Proyecto - TCG Singles Platform

Última actualización: 2026-04-06

## Estado General
- Objetivo actual: Operación diaria estable (inventario + precios) y preparación para expansión comercial.
- Estado técnico: Backend y frontend estables, integración One Piece completa.
- Prioridad de negocio: Minimizar errores de stock, sobreventa y tiempos de actualización de precios.

## Foco Actual

### Prioridad Alta
- Pricing Pipeline: Umbrales de volatilidad configurables y aprobación manual para cambios extremos.
- Inventario Masivo: robustecer rollback parcial y exportes completos.
- Admin y Operación Diaria: cerrar capacidades mínimas para operar sin apoyo técnico.

### Prioridad Media
- Checkout y Control de Stock: TTL de reservas y ciclo completo de estado de orden.
- Cierre Comercial: material de venta, reporte de ahorro, demo comercial.

### Fuera de foco inmediato
- Integración con tienda externa ya operativa (ver roadmap futuro).

## Sección 1 - Fundación Técnica

### Completadas
- [x] Scaffolding fullstack (backend Node/Express + frontend React/Vite + Prisma)
- [x] Modelo de datos base (TCG, Edition, Card, Listing, PriceHistory, ExchangeRate, Cart, Order)
- [x] Endpoints base de catálogo, listings, inventario y carrito
- [x] Corrección de compatibilidad ESM en backend
- [x] Corrección de rutas dinámicas con conflictos de orden
- [x] Type-check y build limpios en backend y frontend

### Pendientes
- [~] Pruebas unitarias base para servicios críticos (parcial: InventoryService con tests, falta cobertura en otros servicios)
- [~] Pruebas de integración para endpoints principales (parcial: tests manuales y algunos flujos cubiertos, falta automatizar)
- [~] Estandarizar manejo de errores con códigos y formato único en toda la API (parcial: algunos endpoints usan formato, falta unificar y documentar)

## Sección 2 - Inventario Masivo

### Completadas
- [x] Endpoint de importación CSV/XLSX de inventario
- [x] Endpoint de validación previa (dry-run)
- [x] Parser robusto (comillas, comas en campos)
- [x] Detección automática de modo de importación
- [x] Validación de headers requeridos
- [x] Registro de importaciones en InventoryImport
- [x] Prevención de imports duplicados por hash
- [x] Endpoint para historial de importaciones (filtros/paginación/orden)
- [x] Endpoint para ver detalle de importación (errores por fila)
- [x] Soporte XLSX además de CSV

### Pendientes
- [~] Rollback configurable para importaciones parciales (parcial: rollback manual posible, falta UI/config y automatizar)
- [~] Exportación CSV completa del historial (parcial: export de página actual implementado, falta exportar historial completo)

## Sección 3 - Pricing Pipeline

### Completadas
- [x] Servicio de cálculo de precio final en CLP
- [x] Historial de cambios de precio
- [x] Detección de cambios volátiles
- [x] Endpoint batch para sincronización masiva de precios
- [x] Job scheduler automático cada 6 horas (configurable)
- [x] Integración real con APIs nativas por TCG
- [x] Eliminación de TCGPlayer API integration
- [x] Error handling robusto
- [x] Bootstrap de catálogo por lote
- [x] Sync automático de sets nuevos

### Pendientes
- [ ] Umbrales de volatilidad configurables por TCG/edición (estructura lista, falta exponer en UI y parametrizar)
- [ ] Flujo de aprobación manual para cambios extremos
- [~] Dashboard de monitoreo de sincronizaciones (parcial: vista básica, falta monitoreo granular y alertas)

## Sección 4 - Checkout y Control de Stock

### Completadas
- [x] Carrito por sesión
- [x] Agregar, actualizar y eliminar items de carrito
- [x] Checkout transaccional con descuento de stock
- [x] Reserva de stock anti-sobreventa

### Pendientes
- [ ] Reserva temporal de stock con expiración de carrito (TTL/cleanup job)
- [ ] Estados de orden más completos (confirmado, enviado, cancelado)
- [ ] Integración de pasarela de pago local

## Sección 5 - Admin y Operación Diaria

### Completadas
- [x] Endpoints base para operaciones de inventario
- [x] UI admin para carga de archivo con prevalidación y confirmación
- [x] Vista de historial de importaciones con detalle de errores
- [x] Filtros por estado/fecha y paginación en historial
- [x] Ordenamiento y exportación CSV de la vista actual
- [x] Dashboard ejecutivo con KPIs
- [x] Alertas de stock bajo en dashboard
- [x] Vista de volatilidad de precios en dashboard

### Pendientes
- [ ] Login admin y roles (admin/staff)
- [ ] Auditoría de acciones por usuario
- [ ] Exportación de reportes semanales (CSV/PDF)

## Sección 6 - Bases de Datos de Cartas Externas

### Completadas
- [x] CardDatabaseService: integración con Scryfall, Pokémon TCG API, YGOPRODeck, OPTCGAPI
- [x] ExternalImportService: importa cartas externas a la BD local con upsert
- [x] Endpoints /api/external: búsqueda, listado de sets, importación de carta individual, importación de set completo
- [x] UI de búsqueda de cartas externas: soporte completo para One Piece
- [x] Precios de referencia desde fuentes externas
- [x] Cache Redis de resultados externos
- [x] Eliminación de tcgplayerProductId campo
- [x] UI/UX modernizada base
- [x] Importación de inventario preparada para CSV/XLSX
- [x] Fix Yu-Gi-Oh en importación por set
- [x] One Piece completamente integrado


## Sección 7 - Cierre Comercial

### Completadas
- [x] Plan de pipeline y backlog por fases
- [x] Definición de foco de valor (inventario + precios)

### Pendientes
- [ ] Reporte de ahorro operativo estimado
- [ ] Demo guiada con datos reales anonimizados
- [ ] Material comercial (propuesta de valor + roadmap de 90 días)

## Siguientes Pasos Recomendados
1. Implementar umbrales de volatilidad configurables por TCG/edición + flujo de aprobación manual para cambios extremos.
2. Cerrar brechas de inventario masivo: rollback parcial configurable y exportación CSV completa del historial.
3. Implementar TTL de carrito y cleanup job para reservas expiradas.
4. Agregar login admin y roles (admin/staff) + auditoría de acciones por usuario.
5. Integrar pasarela de pago local (Stripe o Mercado Pago).
6. Mejorar dashboard con monitoreo granular de sincronizaciones y alertas automáticas.
7. Integración con Cardmarket API para mejorar cobertura de precios en región europea.

## Decisiones Pendientes
- Pasarela de pago: Stripe vs Mercado Pago (decisión de negocio).
- Autenticación: JWT propio vs servicio externo (Auth0, Supabase Auth).

## Definición de Listo (DoD) por Bloque
- Inventario masivo: Archivo validado, errores claros por fila, importación auditable.
- Pricing pipeline: Sync automático estable, cambios extremos controlados.
- Checkout: Sin sobreventa en pruebas concurrentes.
- Admin: Operador puede ejecutar flujo diario sin apoyo técnico.
- Comercial: KPI claros que muestren ahorro y control.

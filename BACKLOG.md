# Backlog del Proyecto - TCG Singles Platform

Ultima actualizacion: 2026-04-04

## Estado General
- Objetivo actual: Resolver operacion diaria de tienda (inventario + precios) antes de expansion comercial.
- Estado tecnico: Backend y frontend compilan sin errores.
- Prioridad de negocio: Reducir errores de stock, sobreventa y tiempo de actualizacion de precios.

## Foco Actual (Lo que nos compete ahora)

### Prioridad Alta (ejecutar ahora)
- Seccion 3 - Pricing Pipeline: Umbrales de volatilidad y aprobacion manual para cambios extremos.
- Seccion 2 - Inventario Masivo: robustecer flujo operativo (rollback parcial y exportes completos).
- Seccion 5 - Admin y Operacion Diaria: cerrar capacidades minimas para operar sin apoyo tecnico.

### Prioridad Media (despues de estabilizar lo anterior)
- Seccion 4 - Checkout y Control de Stock: TTL de reservas y ciclo completo de estado de orden.
- Seccion 7 - Cierre Comercial: material de venta, reporte de ahorro, demo comercial.

### Fuera de foco inmediato (para plan futuro)
- Integracion completa con tienda externa ya operativa (ver roadmap futuro en `INTEGRATION_ROADMAP_FUTURE.md`).

## Seccion 1 - Fundacion Tecnica

### Completadas
- [x] Scaffolding fullstack (backend Node/Express + frontend React/Vite + Prisma)
- [x] Modelo de datos base (TCG, Edition, Card, Listing, PriceHistory, ExchangeRate, Cart, Order)
- [x] Endpoints base de catalogo, listings, inventario y carrito
- [x] Correccion de compatibilidad ESM en backend
- [x] Correccion de rutas dinamicas con conflictos de orden
- [x] Type-check y build limpios en backend y frontend

### Pendientes
- [~] Agregar pruebas unitarias base para servicios criticos (parcial: InventoryService con tests, falta cobertura en otros servicios)
- [~] Agregar pruebas de integracion para endpoints principales (parcial: tests manuales y algunos flujos cubiertos, falta automatizar)
- [~] Estandarizar manejo de errores con codigos y formato unico en toda la API (parcial: algunos endpoints usan formato, falta unificar y documentar)

## Seccion 2 - Inventario Masivo (Dolor Principal de Tienda)

### Completadas
- [x] Endpoint de importacion CSV de inventario
- [x] Endpoint de validacion previa de CSV (dry-run)
- [x] Parser CSV robusto (comillas, comas en campos)
- [x] Deteccion automatica de modo de importacion (listing-update vs full-upsert)
- [x] Validacion de headers requeridos
- [x] Registro de importaciones en InventoryImport
- [x] Prevencion de imports duplicados por hash
- [x] Endpoint para listar historial de importaciones (con filtros/paginacion/orden)
- [x] Endpoint para ver detalle de una importacion (errores por fila)
- [x] **Soporte XLSX** ademas de CSV (via exceljs, deteccion automatica por mimetype/extension)

### Pendientes
- [~] Politica de rollback configurable para importaciones parciales (parcial: rollback manual posible, falta UI/config y automatizar)
- [~] Exportacion CSV completa del historial (parcial: export de página actual implementado, falta exportar historial completo)

## Seccion 3 - Pricing Pipeline

### Completadas
- [x] Servicio de calculo de precio final en CLP
- [x] Historial de cambios de precio
- [x] Deteccion de cambios volatiles
- [x] Endpoint batch para sincronizacion masiva de precios
- [x] **Job scheduler automatico** cada 6 horas (configurable via PRICE_SYNC_CRON)
- [x] **Integracion real con APIs nativas por TCG**:
  - Magic: Scryfall (datos + precios USD)
  - Pokémon: Pokémon TCG API (datos + precios USD)
  - Yu-Gi-Oh: YGOPRODeck (datos + precios multi-fuente: CardMarket, TCGPlayer, eBay, Amazon)
  - One Piece: OPTCGAPI (datos + precios USD market/inventory)
- [x] **Eliminación de TCGPlayer API integration**: Todas las referencias removidas, usar APIs nativas
- [x] **Error handling robusto**: Timeouts configurable, validación de respuestas, logging con prefijos de servicio
- [x] **Bootstrap de catalogo por lote**: comando CLI y endpoint admin para cargar sets completos en BD
- [x] **Sync automatico de sets nuevos**: cron + endpoint admin para detectar y cargar sets que aun no existen en BD

### Pendientes
- [ ] Umbrales de volatilidad configurables por TCG/edicion (estructura lista, falta exponer en UI y parametrizar)
- [ ] Flujo de aprobacion manual para cambios extremos
- [~] Dashboard de monitoreo de sincronizaciones (parcial: vista básica en dashboard, falta monitoreo granular y alertas)

## Seccion 4 - Checkout y Control de Stock

### Completadas
- [x] Carrito por sesion
- [x] Agregar, actualizar y eliminar items de carrito
- [x] Checkout transaccional con descuento de stock
- [x] **Reserva de stock anti-sobreventa**: al agregar al carrito, se verifica stock disponible descontando lo reservado en otros carritos activos

### Pendientes
- [ ] Reserva temporal de stock con expiracion de carrito (TTL/cleanup job)
- [ ] Estados de orden mas completos (confirmado, enviado, cancelado)
- [ ] Integracion de pasarela de pago local

## Seccion 5 - Admin y Operacion Diaria

### Completadas
- [x] Endpoints base para operaciones de inventario
- [x] UI admin para carga de archivo con prevalidacion y confirmacion
- [x] Vista de historial de importaciones con detalle de errores
- [x] Filtros por estado/fecha y paginacion en historial
- [x] Ordenamiento y exportacion CSV de la vista actual
- [x] **Dashboard ejecutivo** con KPIs (cartas, listings, stock bajo, valor inventario, ordenes, tipo de cambio)
- [x] **Alertas de stock bajo** en dashboard
- [x] **Vista de volatilidad de precios** en dashboard

### Pendientes
- [ ] Login admin y roles (admin/staff)
- [ ] Auditoria de acciones por usuario
- [ ] Exportacion de reportes semanales (CSV/PDF)

## Seccion 6 - Bases de Datos de Cartas Externas

### Completadas
- [x] **CardDatabaseService**: integracion con Scryfall (Magic), Pokemon TCG API, YGOPRODeck (Yu-Gi-Oh!), OPTCGAPI (One Piece)
- [x] **ExternalImportService**: importa cartas externas a la BD local con upsert, soporta todos los TCGs incluyendo One Piece
- [x] **Endpoints /api/external**: busqueda, listado de sets, importacion de carta individual, busqueda+importacion, importacion de set completo
- [x] **UI de busqueda de cartas externas**: nueva tab "Buscar Cartas Externas" en el frontend con soporte completo para One Piece
- [x] **Precios de referencia desde fuentes externas**:
  - Scryfall: USD market price (Magic)
  - Pokémon TCG API: USD prices (Pokémon)
  - YGOPRODeck: precios multi-fuente CardMarket/TCGPlayer/eBay/Amazon (Yu-Gi-Oh)
  - OPTCGAPI: USD market_price + inventory_price (One Piece) ✅
- [x] Cache Redis de resultados externos (3 horas TTL)
- [x] **Eliminacion de tcgplayerProductId campo**: Ya no es necesario, se usa directamente las APIs nativas
- [x] UI/UX modernizada base: shell visual, header/footer nuevos, mejor layout de catalogo e importacion
- [x] Importacion de inventario preparada para CSV/XLSX con flujo mas claro de validacion/importacion
- [x] Fix Yu-Gi-Oh en importacion por set desde Browse Sets
- [x] **One Piece completamente integrado**: Search, browse sets, import, sync automático de precios

### Pendientes
- [ ] Integración con Cardmarket API (requiere registro y acceso EU) para mejorar precios de Yu-Gi-Oh en region europea

## Seccion 7 - Cierre Comercial con Dueno de Tienda

### Completadas
- [x] Plan de pipeline y backlog por fases
- [x] Definicion de foco de valor (inventario + precios)

### Pendientes
- [ ] Reporte de ahorro operativo estimado
- [ ] Demo guiada con datos reales anonimizados de la tienda
- [ ] Material comercial (propuesta de valor + roadmap de 90 dias)

## Siguientes Pasos Recomendados (Orden de Ejecucion)
1. Implementar umbrales de volatilidad configurables por TCG/edicion + flujo de aprobacion manual para cambios extremos.
2. Cerrar brechas de inventario masivo: rollback parcial configurable y exportacion CSV completa del historial.
3. Implementar TTL de carrito y cleanup job para reservas expiradas.
4. Agregar login admin y roles (admin/staff) + auditoria de acciones por usuario.
5. Integrar pasarela de pago local (Stripe o Mercado Pago).
6. Mejorar dashboard con monitoreo granular de sincronizaciones y alertas automáticas.
7. Integración con Cardmarket API para mejorar covertura de precios en región europea.

## Decisiones Pendientes (Requieren Input Humano)
- **Cardmarket**: Mercado europeo, requiere registro — si la tienda vende en Europa/latinoamerica con precios europeos.
- **Pasarela de pago**: Stripe (tarjeta de credito internacional) vs Mercado Pago (opciones locales Chile) — decision de negocio.
- **Autenticacion**: Simple JWT propio vs servicio externo (Auth0, Supabase Auth) — impacto en tiempo de desarrollo.

## Definicion de Listo (DoD) por Bloque
- Inventario masivo: Archivo (CSV o XLSX) validado, errores claros por fila, importacion auditable.
- Pricing pipeline: Sync automatico estable, cambios extremos controlados.
- Checkout: Sin sobreventa en pruebas concurrentes.
- Admin: Operador puede ejecutar flujo diario sin apoyo tecnico.
- Comercial: KPI claros que muestren ahorro y control.

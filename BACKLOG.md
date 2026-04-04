# Backlog del Proyecto - TCG Singles Platform

Ultima actualizacion: 2026-04-04

## Estado General
- Objetivo actual: Resolver operacion diaria de tienda (inventario + precios) antes de expansion comercial.
- Estado tecnico: Backend y frontend compilan sin errores.
- Prioridad de negocio: Reducir errores de stock, sobreventa y tiempo de actualizacion de precios.

## Seccion 1 - Fundacion Tecnica

### Completadas
- [x] Scaffolding fullstack (backend Node/Express + frontend React/Vite + Prisma)
- [x] Modelo de datos base (TCG, Edition, Card, Listing, PriceHistory, ExchangeRate, Cart, Order)
- [x] Endpoints base de catalogo, listings, inventario y carrito
- [x] Correccion de compatibilidad ESM en backend
- [x] Correccion de rutas dinamicas con conflictos de orden
- [x] Type-check y build limpios en backend y frontend

### Pendientes
- [ ] Agregar pruebas unitarias base para servicios criticos
- [ ] Agregar pruebas de integracion para endpoints principales
- [ ] Estandarizar manejo de errores con codigos y formato unico en toda la API

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
- [ ] Politica de rollback configurable para importaciones parciales
- [ ] Exportacion CSV completa del historial (no solo pagina actual)

## Seccion 3 - Pricing Pipeline

### Completadas
- [x] Servicio de calculo de precio final en CLP
- [x] Historial de cambios de precio
- [x] Deteccion de cambios volatiles
- [x] Endpoint batch para sincronizacion masiva de precios
- [x] **Job scheduler automatico** cada 6 horas (configurable via PRICE_SYNC_CRON)
- [x] **Integracion real con fuentes de precios externas** (Scryfall, Pokemon TCG API, YGOPRODeck) — el cron job ahora busca precios de mercado actualizados por card

### Pendientes
- [ ] Umbrales de volatilidad configurables por TCG/edicion
- [ ] Flujo de aprobacion manual para cambios extremos
- [ ] Dashboard de monitoreo de sincronizaciones (basico implementado en Dashboard)

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
- [x] **CardDatabaseService**: integracion con Scryfall (Magic), Pokemon TCG API, YGOPRODeck (Yu-Gi-Oh!)
- [x] **ExternalImportService**: importa cartas externas a la BD local con upsert
- [x] **Endpoints /api/external**: busqueda, listado de sets, importacion de carta individual, busqueda+importacion, importacion de set completo
- [x] **UI de busqueda de cartas externas**: nueva tab "Buscar Cartas Externas" en el frontend
- [x] **Precios de referencia desde fuentes externas**: Scryfall (USD market price), Pokemon TCG API (TCGplayer prices), YGOPRODeck (TCGplayer/Cardmarket prices)
- [x] Cache Redis de resultados externos (3 horas TTL)

### Pendientes
- [ ] Integracion con TCGPlayer API (requiere aprobacion de API key)
- [ ] Integracion con Cardmarket API (requiere registro y acceso EU)

## Seccion 7 - Cierre Comercial con Dueno de Tienda

### Completadas
- [x] Plan de pipeline y backlog por fases
- [x] Definicion de foco de valor (inventario + precios)

### Pendientes
- [ ] Reporte de ahorro operativo estimado
- [ ] Demo guiada con datos reales anonimizados de la tienda
- [ ] Material comercial (propuesta de valor + roadmap de 90 dias)

## Siguientes Pasos Recomendados (Orden de Ejecucion)
1. Configurar PostgreSQL y Redis localmente, ejecutar `npm run prisma:push` y `npm run prisma:seed`.
2. Probar busqueda de cartas externas (Scryfall/Pokemon/YGO) en la nueva tab.
3. Importar un set completo (ej: `MH3` de Magic) para poblar el catalogo.
4. Activar sync automatico de precios con `PRICE_SYNC_ENABLED=true` en `.env`.
5. Implementar TTL de carrito y cleanup job para reservas expiradas.
6. Agregar login admin y roles (admin/staff) antes de abrir a usuarios reales.
7. Integrar pasarela de pago local (Stripe o Mercado Pago).

## Decisiones Pendientes (Requieren Input Humano)
- **TCGPlayer API**: Requiere aplicar en https://developer.tcgplayer.com/ — una vez con key, reemplazar ExchangeRateService.fetchRate con datos reales de TCGPlayer.
- **Cardmarket**: Mercado europeo, requiere registro — si la tienda vende en Europa/latinoamerica con precios europeos.
- **Pasarela de pago**: Stripe (tarjeta de credito internacional) vs Mercado Pago (opciones locales Chile) — decision de negocio.
- **Autenticacion**: Simple JWT propio vs servicio externo (Auth0, Supabase Auth) — impacto en tiempo de desarrollo.

## Definicion de Listo (DoD) por Bloque
- Inventario masivo: Archivo (CSV o XLSX) validado, errores claros por fila, importacion auditable.
- Pricing pipeline: Sync automatico estable, cambios extremos controlados.
- Checkout: Sin sobreventa en pruebas concurrentes.
- Admin: Operador puede ejecutar flujo diario sin apoyo tecnico.
- Comercial: KPI claros que muestren ahorro y control.

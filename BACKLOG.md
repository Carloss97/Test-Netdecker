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

### Pendientes
- [ ] Soporte XLSX ademas de CSV
- [ ] Politica de rollback configurable para importaciones parciales
- [ ] Exportacion CSV completa del historial (no solo pagina actual)

## Seccion 3 - Pricing Pipeline

### Completadas
- [x] Servicio de calculo de precio final en CLP
- [x] Historial de cambios de precio
- [x] Deteccion de cambios volatiles
- [x] Endpoint batch para sincronizacion masiva de precios

### Pendientes
- [ ] Job scheduler automatico cada 4-6 horas
- [ ] Integracion real con fuente principal + fallback de precios
- [ ] Umbrales de volatilidad configurables por TCG/edicion
- [ ] Flujo de aprobacion manual para cambios extremos
- [ ] Dashboard de monitoreo de sincronizaciones

## Seccion 4 - Checkout y Control de Stock

### Completadas
- [x] Carrito por sesion
- [x] Agregar, actualizar y eliminar items de carrito
- [x] Checkout transaccional con descuento de stock

### Pendientes
- [ ] Reserva temporal de stock con expiracion de carrito
- [ ] Reglas anti-sobreventa para alta concurrencia
- [ ] Estados de orden mas completos (confirmado, enviado, cancelado)
- [ ] Integracion de pasarela de pago local

## Seccion 5 - Admin y Operacion Diaria

### Completadas
- [x] Endpoints base para operaciones de inventario
- [x] UI admin para carga de archivo con prevalidacion y confirmacion
- [x] Vista de historial de importaciones con detalle de errores
- [x] Filtros por estado/fecha y paginacion en historial
- [x] Ordenamiento y exportacion CSV de la vista actual

### Pendientes
- [ ] Login admin y roles (admin/staff)
- [ ] Panel admin de inventario (stock bajo, sin stock, valor inventario)
- [ ] Panel admin de precios (historial, volatilidad, aprobaciones)
- [ ] Auditoria de acciones por usuario
- [ ] Exportacion de reportes semanales (CSV/PDF)

## Seccion 6 - Cierre Comercial con Dueno de Tienda

### Completadas
- [x] Plan de pipeline y backlog por fases
- [x] Definicion de foco de valor (inventario + precios)

### Pendientes
- [ ] Dashboard ejecutivo con KPIs para toma de decision
- [ ] Reporte de ahorro operativo estimado
- [ ] Demo guiada con datos reales anonimizados de la tienda
- [ ] Material comercial (propuesta de valor + roadmap de 90 dias)

## Siguientes Pasos Recomendados (Orden de Ejecucion)
1. Soporte XLSX ademas de CSV para cargas masivas.
2. Exportacion CSV completa del historial respetando filtros activos.
3. Activar job automatico de sync de precios con monitoreo.
4. Implementar reserva de stock temporal en checkout.
5. Preparar dashboard ejecutivo para presentacion comercial.

## Definicion de Listo (DoD) por Bloque
- Inventario masivo: Archivo validado, errores claros por fila, importacion auditable.
- Pricing pipeline: Sync automatico estable, cambios extremos controlados.
- Checkout: Sin sobreventa en pruebas concurrentes.
- Admin: Operador puede ejecutar flujo diario sin apoyo tecnico.
- Comercial: KPI claros que muestren ahorro y control.

# Pendientes, mejoras y cosas medio rotas

## Cambios aplicados recientes
- Margen por defecto bajado de 1.2 a 1.0 en backend y frontend (creación de listings, bootstrap/sync, importaciones y formularios de admin).
- Sprint de hardening UI/UX de pricing/inventory: cerrado.
- Pruebas de interfaz agregadas en frontend para Pricing, Card Search e Inventario.

## Pendientes funcionales (actualizado)
- [x] UI de selección de TCG para sincronización de ediciones en Admin.
- [x] Quitar etiqueta "manual" redundante en toggles.
- [x] Revisar input de precio manual para flujo consistente.
- [x] Ajustes de Card Search (condición, columna modo, toggle/input).
- [x] Modo manual en Inventario solo para cartas con stock activo.

## Mejoras de calidad/arquitectura
- [x] Centralizar margen por defecto en constante/config.
- [x] Tests de regresión para defaults de margen.
- [x] Validación de UI para inputs numéricos de margen/precio.
- [x] Lint/typecheck en pre-commit o CI para detectar corrupción de JSX/TSX.

## Cosas frágiles detectadas
- [x] Card Search: tabla sensible a desalineación, ajustado y estabilizado.
- [x] Inventario: toggle de modo manual funcional solo con stock activo.
- [x] Backend: removido hardcode de contexto usuario admin para historial de precio.

## Recomendaciones próximas
- Cerrar pendientes de toggles y precio manual.
- Estabilizar tablas de Card Search e Inventario.
- Cubrir con tests de interfaz y validaciones básicas.
- Mejorar monitoreo granular de sincronizaciones y alertas automáticas.
- Avanzar en exportación CSV completa del historial de importaciones.

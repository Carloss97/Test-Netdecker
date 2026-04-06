# Pendientes, mejoras y cosas medio rotas

## Cambios aplicados hoy
- Se bajó el margen por defecto de 1.2 a 1.0 en backend y frontend (creación de listings, bootstrap/sync, importaciones y formularios de admin).

## Estado de cierre (2026-04-05)
- Sprint de hardening UI/UX de pricing/inventory: cerrado.
- Se completaron los pendientes funcionales, de calidad/arquitectura y los puntos frágiles detectados en este documento.
- Se agregaron pruebas de interfaz en frontend para flujos manual/API en Pricing, Card Search e Inventario.

## Pendientes funcionales
- [x] Completar la UI de selección de TCG para sincronización de ediciones en Admin.
- [x] Quitar la etiqueta textual "manual" en toggles donde todavía se vea redundante.
- [x] Revisar el input de precio manual para que el flujo sea consistente en blur/enter y no confunda entre CLP final y referencia USD.
- [x] Completar el ajuste de Card Search:
  - [x] Quitar condición donde no corresponda.
  - [x] Corregir columna de modo.
  - [x] Revisar toggle y número input para que no desalineen la tabla.
- [x] Agregar modo manual en Inventario solo para cartas con inventario activo.

## Cosas a mejorar (calidad/arquitectura)
- [x] Centralizar el valor de margen por defecto en una sola constante/config para evitar hardcode repetido.
- [x] Agregar tests de regresión para defaults de margen (esperar 1.0 en flujos de creación/importación).
- [x] Agregar validación de UI para inputs numéricos de margen/precio con mensajes más claros.
- [x] Incorporar lint/typecheck en pre-commit o CI para detectar corrupción de JSX/TSX antes de correr Vite.

## Cosas medio rotas o frágiles detectadas
- [x] Card Search tenía estructura de tabla sensible a desalineación (colgroup/columnas), ajustado y estabilizado.
- [x] Inventario ya compila y el toggle de modo manual quedó integrado funcionalmente (solo con stock activo).
- [x] En backend se removió el hardcode de contexto usuario admin para historial de precio.

## Recomendación de siguiente sprint corto
- Sprint de hardening UI/UX de pricing/inventory (1-2 días):
  - cerrar pendientes de toggles y precio manual,
  - estabilizar tablas de Card Search e Inventario,
  - cubrir con tests de interfaz y validaciones básicas.

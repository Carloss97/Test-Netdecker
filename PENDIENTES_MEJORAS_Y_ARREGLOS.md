# Pendientes, mejoras y cosas medio rotas

## Cambios aplicados hoy
- Se bajó el margen por defecto de 1.2 a 1.0 en backend y frontend (creación de listings, bootstrap/sync, importaciones y formularios de admin).

## Pendientes funcionales
- Completar la UI de selección de TCG para sincronización de ediciones en Admin.
- Quitar la etiqueta textual "manual" en toggles donde todavía se vea redundante.
- Revisar el input de precio manual para que el flujo sea consistente en blur/enter y no confunda entre CLP final y referencia USD.
- Completar el ajuste de Card Search:
  - Quitar condición donde no corresponda.
  - Corregir columna de modo.
  - Revisar toggle y número input para que no desalineen la tabla.
- Agregar modo manual en Inventario solo para cartas con inventario activo.

## Cosas a mejorar (calidad/arquitectura)
- Centralizar el valor de margen por defecto en una sola constante/config para evitar hardcode repetido.
- Agregar tests de regresión para defaults de margen (esperar 1.0 en flujos de creación/importación).
- Agregar validación de UI para inputs numéricos de margen/precio con mensajes más claros.
- Incorporar lint/typecheck en pre-commit o CI para detectar corrupción de JSX/TSX antes de correr Vite.

## Cosas medio rotas o frágiles detectadas
- Card Search tiene estructura de tabla sensible a desalineación (colgroup/columnas), fácil de romper con cambios pequeños.
- Inventario ya compila, pero el toggle de modo manual no está integrado funcionalmente en el flujo actual.
- En backend todavía hay un TODO de seguridad en contexto de usuario admin:
  - backend/src/controllers/ListingController.ts: se usa "admin" hardcodeado para historial de precio.

## Recomendación de siguiente sprint corto
- Sprint de hardening UI/UX de pricing/inventory (1-2 días):
  - cerrar pendientes de toggles y precio manual,
  - estabilizar tablas de Card Search e Inventario,
  - cubrir con tests de interfaz y validaciones básicas.

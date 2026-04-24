# QA Checklist Corto (Smoke) - Storefront y Operacion de Tienda

Objetivo: validar en 10-15 minutos que los flujos criticos de tienda funcionan sin bloqueos.

## Preparacion
- [ ] Backend y frontend levantados (`npm run dev` desde raiz).
- [ ] Sesion iniciada como admin/dueno de tienda.
- [ ] Tienda activa visible en storefront.

## Smoke Funcional
- [ ] Abrir storefront y confirmar carga de catalogo (sin errores visibles).
- [ ] Buscar una carta por nombre y verificar que el grid filtra resultados.
- [ ] Aplicar filtro por TCG y rareza y verificar que los resultados cambian.
- [ ] Abrir detalle de una carta y confirmar datos principales (nombre, edicion, precio, stock).
- [ ] Agregar carta al carrito desde card grid.
- [ ] Cambiar cantidad en carrito y validar recalculo del total.
- [ ] Ir a checkout y completar venta demo.

## Smoke de Estados Async (P4-002)
- [ ] Forzar error de red y validar mensaje claro + boton Reintentar en storefront.
- [ ] Recuperar red y confirmar que Reintentar vuelve a cargar catalogo.
- [ ] Cambiar tienda activa y confirmar recarga sin refresh manual del navegador.

## Smoke de Observabilidad (P4-003)
- [ ] Con DevTools abierto, forzar un fallo API.
- [ ] Confirmar logs estructurados con `area`, `action`, `message`, `context`.
- [ ] Verificar que no aparece contenido demo fake cuando falla backend.

## Criterio de salida
- [ ] Ningun bloqueo en flujo buscar -> agregar -> carrito -> checkout.
- [ ] Errores recuperables con retry.
- [ ] Cambios de tienda reflejados en UI sin refresh manual.

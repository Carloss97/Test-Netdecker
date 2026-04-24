# QA Checklist Extenso - Prueba Piloto (Perspectiva Dueno de Tienda)

Objetivo: validar operacion end-to-end antes de piloto con usuarios reales.

## 1. Setup y Accesos
- [ ] Variables de entorno configuradas en backend.
- [ ] Base de datos accesible y con datos de prueba representativos.
- [ ] Backend y frontend levantados.
- [ ] Usuario admin/dueno de tienda con credenciales validas.
- [ ] Validar login y redireccion a panel admin.

## 2. Contexto Multi-Tienda
- [ ] Ver tienda activa al entrar al storefront.
- [ ] Cambiar tienda activa desde layout/admin.
- [ ] Confirmar que storefront y datos de catalogo cambian con la tienda.
- [ ] Confirmar que no se requiere refresh manual del navegador.

## 3. Catalogo y Busqueda
- [ ] Carga inicial de catalogo sin errores.
- [ ] Busqueda por nombre devuelve resultados esperados.
- [ ] Filtro por TCG devuelve subconjunto correcto.
- [ ] Filtro por rareza devuelve subconjunto correcto.
- [ ] Filtro por rango de precio minimo/maximo funciona.
- [ ] Limpiar filtros restaura el listado.

## 4. Experiencia de Producto
- [ ] Abrir modal de detalle desde card.
- [ ] Verificar nombre, edicion, rareza, condicion, precio y stock.
- [ ] Agregar al carrito desde modal.
- [ ] Carta sin stock no permite agregar.

## 5. Carrito y Checkout
- [ ] Carrito abre/cierra correctamente.
- [ ] Ajustar cantidad actualiza total.
- [ ] Quitar item actualiza total.
- [ ] Vaciar carrito funciona.
- [ ] Checkout genera orden/venta correctamente.
- [ ] Confirmar feedback de exito o error claro.

## 6. Inventario (Operacion del Dueno)
- [ ] Entrar a Inventario y cargar TCGs.
- [ ] Seleccionar juego y cargar ediciones.
- [ ] Seleccionar edicion y cargar cartas.
- [ ] Editar stock con +/-, input directo y guardar lote.
- [ ] Verificar mensaje de exito post guardado.
- [ ] Probar importacion CSV y recarga de cartas.

## 7. Importaciones y Catalogo
- [ ] ImportPage carga TCGs con estado loading/error/retry.
- [ ] Historial de importaciones carga con loading/error/retry.
- [ ] Importar set externo exitosamente.
- [ ] Verificar que TCGs disponibles incluyen los soportados.

## 8. Resiliencia y Errores
- [ ] Simular backend caido: storefront muestra error recuperable.
- [ ] Simular backend caido: inventory muestra error por bloque (TCG/edicion/cartas).
- [ ] Botones Reintentar recuperan flujo al restablecer backend.
- [ ] Sin caidas de UI por excepciones no controladas.

## 9. Observabilidad
- [ ] Revisar consola para logs estructurados en fallos.
- [ ] Revisar `area/action` coherentes con la pantalla afectada.
- [ ] Confirmar captura de errores globales (runtime/unhandled rejection).

## 10. Rendimiento Percibido (P4-004)
- [ ] Escribir busqueda rapida en catalogo sin lag perceptible.
- [ ] Cambiar filtros repetidamente sin congelamientos.
- [ ] Scroll de grid estable con catalogo grande.
- [ ] Cambio de carrito/modal no degrada claramente la respuesta del grid.

## 11. Criterios Go/No-Go Piloto
- [ ] Flujo completo dueno: login -> inventario -> storefront -> checkout sin bloqueos.
- [ ] Sin errores criticos en consola durante operacion normal.
- [ ] Recuperacion por retry validada en al menos 3 fallos simulados.
- [ ] Stakeholder valida experiencia minima de operacion diaria.

## Evidencia sugerida
- [ ] Capturas de pantalla por modulo (login, inventario, storefront, checkout).
- [ ] Registro breve de incidentes encontrados + severidad.
- [ ] Video corto (2-3 min) del flujo happy path.

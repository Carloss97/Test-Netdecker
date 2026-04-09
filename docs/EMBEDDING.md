**Widget embebible (iframe) — Guía rápida**

Objetivo: ofrecer a una tienda un fragmento HTML que pegue en su página (WordPress, Shopify, etc.) y muestre el catálogo gestionado por tu app.

URL pública expuesta en esta repo (ejemplo local):
- https://tu-app.com/tienda/:slug/catalogo

Snippet que la tienda pega en su web (reemplazar `tu-app.com` y `tienda123`):

```html
<iframe src="https://tu-app.com/tienda/tienda123/catalogo" width="100%" height="600" style="border:0;" loading="lazy"></iframe>
```

Notas operativas:
- El iframe carga una vista pública minimalista que consulta `/api/listings/available` en tu backend y muestra cartas con imagen, nombre, stock y precio.
- Actualmente el sistema es single-tenant: el `:slug` es solo decorativo. En la Fase 2 se añadirá `Store`/`storeId` en la base de datos y el endpoint filtrará por tienda para asegurar aislamiento.
- Si quieres garantizar que el catálogo deje de mostrarse cuando una tienda deje de pagar (lock-in), en Fase 2 debes introducir autenticación por `store` y/o un `embedKey` por tienda; la página embebida comprobará el acceso mediante ese token.

Siguientes pasos recomendados (prioridad alta):
1. Agregar `model Store` en Prisma y `storeId` en `Listing`/`InventoryImport` para soportar multitenancy.
2. Permitir que la tienda registre un `embedKey` (API key pública-readonly) y validar la clave en la vista pública.
3. Opcional: servir una versión cacheada (CDN) del HTML y/o JSON público para escalar y reducir latencia.

¿Cómo probar hoy mismo?
- Ejecuta el backend (puerto por defecto `3333`) y visita `http://localhost:3333/tienda/mi-tienda/catalogo`.
- Para importar CSV con mapeo: en la UI admin, ve a `/import-mapper` y sigue el flujo (validar → importar). Si tu backend requiere `x-api-key`, ponla en el campo de API Key.


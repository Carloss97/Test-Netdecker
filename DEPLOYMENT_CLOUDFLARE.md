Despliegue en Cloudflare Pages + D1 (guía rápida)
===============================================

Objetivo
--------
Publicar la single-page app `frontend` en Cloudflare Pages y usar D1 (SQLite-like) para la fase inicial.

Resumen de pasos
----------------
1. Crear proyecto en Cloudflare Pages y vincular este repo.
2. Configurar el Build command en Pages: `npm run build` (raíz del monorepo).
3. Set output directory: `frontend/dist`.
4. Crear una base de datos D1 en la cuenta Cloudflare y darla el nombre (ej. `tcg-erp-db`).
5. Añadir binding en Pages/Wrangler: binding name `TCG_D1` que apunte a la DB creada.
6. Configurar variables de entorno necesarias (ver sección abajo).
7. Publicar y verificar dominio `testing-erp.krumm.cl` configurando la entrada DNS/CNAME.

Detalles importantes
-------------------
- Build command: `npm run build`. Nuestro `scripts/build.js` detecta si estamos en CI (Cloudflare Pages) y sólo construye el frontend (evita instalar/compilar backend en Pages CI).
- Output dir: `frontend/dist` (Pages servirá este contenido estático).
- Node version: Cloudflare Pages usa una imagen basada en Node 18/20/22; recomendamos Node 22 (ya usado en el repo CI logs).

Variables de entorno recomendadas (build vs runtime)
--------------------------------------------------
- BUILD (no necesarias para build si sólo es frontend): ninguno adicional.
- RUNTIME (solo si el frontend o funciones necesitan keys):
  - `MERCADOPAGO_ACCESS_TOKEN` (si integras MercadoPago en tiempo de ejecución)
  - `STRIPE_SECRET_KEY` (si usas Stripe webhooks/funciones)
  - `IMPORT_API_KEY` (si usas import endpoints protegidos)
  - `TCG_D1` (Pages D1 binding — agregado via Pages dashboard / wrangler config)

D1 binding (wrangler)
---------------------
Si publicas con Wrangler, `wrangler.*` config ya contiene la referencia. Verifica `wrangler.jsonc` o `wrangler.toml` y asegúrate de que existe una entrada para `d1_databases` o `d1_bindings` con name `TCG_D1` y database name `tcg-erp-db`.

Comandos útiles
---------------
- Local build (monorepo):

  ```bash
  npm run build
  ```

- Publicar manualmente desde la CLI (Pages):

  ```bash
  npx wrangler pages publish frontend/dist --project-name testing-erp --branch main
  ```

- Desplegar con `wrangler` (funciones / D1 bindings):

  ```bash
  npx wrangler deploy
  ```

Notas sobre CI
--------------
- Cloudflare Pages ejecutará `npm install` en la raíz; el repo contiene un `postinstall`/`scripts/postinstall.js` que evita instalar dependencias del backend en Pages CI (esto previene errores por dependencias opcionales como `mercadopago`).

DNS / dominio
-------------
- En el panel de Pages, añade el dominio `testing-erp.krumm.cl` y sigue las instrucciones para configurar CNAME o los registros necesarios.
- Asegúrate de habilitar HTTPS (Pages gestiona certificados automáticamente).

Checklist final
---------------
- [ ] `frontend/dist` se genera correctamente con `npm run build`.
- [ ] D1 database creada y binding `TCG_D1` configurado.
- [ ] Secrets/runtime env vars añadidas en Pages/Workers.
- [ ] Dominio `testing-erp.krumm.cl` apuntado y TLS verificado.

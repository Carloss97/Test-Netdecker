# Cloudflare Pages - Quick contributor notes

Breve guía para desarrollar, desplegar y mantener las Pages Functions y los workers usados por este repo.

Secrets mínimos (GitHub repo secrets / Pages environment):
- `PAGES_URL` — URL pública de Pages deployment (ej: `https://tcg-erp.pages.dev`). Usada por los cron jobs y workflows.
- `ADMIN_MIGRATE_TOKEN` — token opcional para proteger el endpoint `api/admin/migrate` (encabezado `x-admin-token`).

Despliegue local (Pages Functions + frontend):

1. Instala dependencias en root, backend y frontend:

```powershell
npm install
npm --prefix backend install
npm --prefix frontend install
```

2. Levanta Pages en modo desarrollo (sirve `frontend` y Functions):

```powershell
npx --yes wrangler@4 pages dev frontend --project-name tcg-erp --port 8787
```

3. Ejecuta tests de backend:

```powershell
npm --prefix backend run test
```

Despliegue a Pages (example):

```powershell
npx --yes wrangler@latest pages deploy frontend/dist --project-name tcg-erp --branch main
```

Habilitar cron automáticos (GitHub Actions):

- Añade `PAGES_URL` en Settings → Secrets → Actions. Las workflows `.github/workflows/cron-*.yml` usan este secreto para invocar tus endpoints.
- (Opcional) Añade `ADMIN_MIGRATE_TOKEN` si quieres proteger `api/admin/migrate`.

Consejos operativos:
- Usa `api/health` para comprobar conectividad D1 tras deploy.
- Evita modificar D1 schema manualmente en producción; usa `api/admin/migrate` con `ADMIN_MIGRATE_TOKEN` para ejecutar `ensureSchema` de forma idempotente.
- Si un worker cron falla repetidamente, revisa `PAGES_URL` y la respuesta JSON del endpoint (las workers ahora intentan reintentar con backoff y timeouts).

Si necesitas que añada pasos automatizados (tests CI, más comprobaciones de salud, o alertas), dime cuál prefieres y lo implemento.

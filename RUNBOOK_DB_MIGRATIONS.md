# Runbook: Database migrations and safe deploy

Fecha: 2026-04-10

Objetivo
--------
Procedimiento seguro para aplicar cambios de esquema (Prisma) en entornos staging/producción, incluyendo backups y rollback básico.

Requisitos previos
- Acceso SSH al host de despliegue con Docker
- `prod.env` en el host con `DATABASE_URL` apuntando a la base de datos de producción
- `GHCR_PAT` y secretos configurados en GitHub Actions

Pasos (manual - recomendado antes de automatizar):

1) Backup de la base de datos (producción)

  - Postgres (managed): usar snapshot o herramienta del proveedor.
  - Postgres (self-hosted): ejecutar:

```bash
PGPASSWORD="$DB_PASS" pg_dump -h $DB_HOST -U $DB_USER -F c -b -v -f "/backups/tcg_singles_$(date +%F_%s).dump" $DB_NAME
```

2) Construir y probar migración en entorno local o staging

  - Pull de la rama con cambios de Prisma
  - Ejecutar localmente con una copia de la base de datos (no la prod).

```bash
cd backend
npm install
# Generar cliente Prisma para SQLite o Postgres según entorno
npm run prisma:generate
# Ejecutar migraciones en una base local de pruebas
PRISMA_MIGRATION_NAME="describe-change" npm run prisma:migrate --workspace=backend
```

3) Crear migration file (si aplica)

  - Usar `prisma migrate dev --name <name>` durante desarrollo para crear la migración.
  - Para deploy, preferir `prisma migrate deploy` en el host después de un backup.

4) Despliegue en producción (manual seguro)

  - SSH al host de producción
  - Detener el servicio o poner en modo mantenimiento
  - Hacer backup (ver paso 1)
  - Pull de la imagen/container nuevo o actualizar código
  - Ejecutar migraciones:

```bash
# Dentro del host o en el container
npm --prefix backend run prisma:generate
PRISMA_MIGRATION=true prisma migrate deploy
```

  - Levantar el servicio y ejecutar smoke checks `/api/health` y `/api/ready`.

Rollback básico
- Mantener la imagen anterior disponible en GHCR y usar `docker run` para volver al tag previo si algo falla.
- Si la migración es no-reversible, considerar restaurar backup completo y volver a la imagen anterior.

Notas operacionales
- Evitar cambios que borren columnas con datos importantes sin una estrategia de migración en dos pasos (crear nueva columna → backfill → cambiar lecturas → borrar antigua).
- Para cambios destructivos: 1) añadir columna nueva, 2) deploy que escribe en ambas, 3) backfill, 4) cambiar a la nueva columna, 5) deploy que elimina la antigua.

Backfill: warehouse stock (por-warehouse)
----------------------------------------

Este proyecto añade un modelo de `WarehouseStock` y movimientos de stock. El script de backfill `backend/scripts/backfill-warehouse-stock.ts` soporta modo `dry-run` (por defecto) y `--apply` para ejecutar cambios.

Recomendación de pasos en `staging`:

1. Hacer backup de la DB de staging (ver sección Backups arriba).

2. Ejecutar dry-run para validar el número de listings afectados (no muta la DB):

```bash
# desde el root del repo (ajusta DATABASE_URL al staging)
DATABASE_URL="$STAGING_DATABASE_URL" npx tsx backend/scripts/backfill-warehouse-stock.ts --limit 100
```

3. Revisar la salida y muestreos. Si todo luce correcto, ejecutar en apply (sin `--limit` para procesar todo):

```bash
DATABASE_URL="$STAGING_DATABASE_URL" npx tsx backend/scripts/backfill-warehouse-stock.ts --apply
```

4. Verificar en staging:

- Revisar tablas `WarehouseStock`, `StockSnapshot` y `StockMovement` para muestras aleatorias.
- Ejecutar smoke tests: `GET /api/health`, luego pruebas manuales de POS y reservas.

5. Si algo falla, restaurar el backup y revisar logs antes de intentar nuevamente.

Nota: el script es idempotente — detecta movimientos con `reference: migration:initial-stock` y evita crear duplicados. Aun así, siempre validar en staging antes de producción.

---
Archivo creado automáticamente por el agente para facilitar despliegues seguros.

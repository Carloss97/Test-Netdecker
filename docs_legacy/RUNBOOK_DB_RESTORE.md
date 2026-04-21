# Runbook: Backup and Restore - Postgres & Redis

This runbook summarizes commands and quick procedures for daily backups and emergency restores for Postgres and Redis used by the project.

WARNING: Test restores on a staging environment before performing production restores.

## Postgres (daily backup)

- Create a logical dump of the `tcg_singles_db` database:

```bash
PGHOST=127.0.0.1 PGPORT=5432 PGUSER=user PGDATABASE=tcg_singles_db \
  pg_dump --format=custom --file=/backups/tcg_singles_db-$(date +%F).dump
```

- Verify dump file exists and size > 0.

## Postgres (restore)

- Restore to a new DB (safe approach):

```bash
createdb -h $PGHOST -p $PGPORT -U $PGUSER tcg_singles_db_restore
pg_restore --verbose --clean --no-owner --dbname=tcg_singles_db_restore /backups/FILE.dump
```

- To restore into production DB (destructive):

1. Stop application servers or put them into maintenance.
2. Ensure you have a recent dump and tested restore plan.
3. Restore:

```bash
pg_restore --verbose --clean --no-owner --dbname=tcg_singles_db /backups/FILE.dump
```

4. Start app and verify critical endpoints and data integrity (orders, listings, price history).

## Postgres point-in-time (WAL) and filesystem backups

- If using WAL-based backups (pg_basebackup + WAL archive), follow the documented recovery steps and ensure `recovery.conf` or `restore_command` is set according to your backup strategy.

## Redis (RDB snapshot)

- Create a snapshot (if using RDB):

```bash
redis-cli SAVE
# The dump file will be at the configured `dir` (e.g., /var/lib/redis/dump.rdb)
cp /var/lib/redis/dump.rdb /backups/redis-dump-$(date +%F).rdb
```

- Restore Redis (replace data directory):

1. Stop Redis service.
2. Replace `dump.rdb` with the backup file.
3. Start Redis service.

## Redis (AOF)

- If AOF is enabled, copy the `appendonly.aof` file as your backup and use Redis tools to rewrite/repair if needed.

## Verification checklist after restore

- App responds on `/api/health/ready`.
- Critical queries return expected results (single sample orders/listings).
- Background jobs (price sync, catalog sync) start normally.

## Emergency contacts & notes

- Repo maintainers: check `OWNERS` or project README for contact details (on-call Slack/phone/email).
- Keep a copy of DB credentials and connection info in a secure vault (do not store plaintext in repo).

## Quick commands (summary)

```bash
# Dump
pg_dump -h $PGHOST -U $PGUSER -F c -f /backups/db.dump $PGDATABASE

# Restore
pg_restore -h $PGHOST -U $PGUSER -d $PGDATABASE /backups/db.dump

# Redis snapshot
redis-cli SAVE
cp /var/lib/redis/dump.rdb /backups/redis-rdb-$(date +%F).rdb
```

Keep this runbook synchronised with your operational runbooks and CI/CD deployment procedures.
# Runbook: Backup and Restore - Postgres & Redis

This runbook summarizes commands and quick procedures for daily backups and emergency restores for Postgres and Redis used by the project.

WARNING: Test restores on a staging environment before performing production restores.

## Postgres (daily backup)

- Create a logical dump of the `tcg_singles_db` database:

```bash
PGHOST=127.0.0.1 PGPORT=5432 PGUSER=user PGDATABASE=tcg_singles_db \
  pg_dump --format=custom --file=/backups/tcg_singles_db-$(date +%F).dump
```

- Verify dump file exists and size > 0.

## Postgres (restore)

- Restore to a new DB (safe approach):

```bash
createdb -h $PGHOST -p $PGPORT -U $PGUSER tcg_singles_db_restore
pg_restore --verbose --clean --no-owner --dbname=tcg_singles_db_restore /backups/FILE.dump
```

- To restore into production DB (destructive):

1. Stop application servers or put them into maintenance.
2. Ensure you have a recent dump and tested restore plan.
3. Restore:

```bash
pg_restore --verbose --clean --no-owner --dbname=tcg_singles_db /backups/FILE.dump
```

4. Start app and verify critical endpoints and data integrity (orders, listings, price history).

## Postgres point-in-time (WAL) and filesystem backups

- If using WAL-based backups (pg_basebackup + WAL archive), follow the documented recovery steps and ensure `recovery.conf` or `restore_command` is set according to your backup strategy.

## Redis (RDB snapshot)

- Create a snapshot (if using RDB):

```bash
redis-cli SAVE
# The dump file will be at the configured `dir` (e.g., /var/lib/redis/dump.rdb)
cp /var/lib/redis/dump.rdb /backups/redis-dump-$(date +%F).rdb
```

- Restore Redis (replace data directory):

1. Stop Redis service.
2. Replace `dump.rdb` with the backup file.
3. Start Redis service.

## Redis (AOF)

- If AOF is enabled, copy the `appendonly.aof` file as your backup and use Redis tools to rewrite/repair if needed.

## Verification checklist after restore

- App responds on `/api/health/ready`.
- Critical queries return expected results (single sample orders/listings).
- Background jobs (price sync, catalog sync) start normally.

## Emergency contacts & notes

- Repo maintainers: check `OWNERS` or project README for contact details (on-call Slack/phone/email).
- Keep a copy of DB credentials and connection info in a secure vault (do not store plaintext in repo).

## Quick commands (summary)

```bash
# Dump
pg_dump -h $PGHOST -U $PGUSER -F c -f /backups/db.dump $PGDATABASE

# Restore
pg_restore -h $PGHOST -U $PGUSER -d $PGDATABASE /backups/db.dump

# Redis snapshot
redis-cli SAVE
cp /var/lib/redis/dump.rdb /backups/redis-rdb-$(date +%F).rdb
```

Keep this runbook synchronised with your operational runbooks and CI/CD deployment procedures.

# Runbook (common operational procedures)

Quick actions

- Check logs (host):

  docker logs -f tcg-backend

- Restart service:

  docker restart tcg-backend

- Deploy new image (quick rollback-ready flow):

  docker pull ghcr.io/<OWNER>/test-netdecker-backend:<tag>
  docker stop tcg-backend || true
  docker rm tcg-backend || true
  docker run -d --name tcg-backend --env-file /home/<user>/prod.env -p 3333:3333 ghcr.io/<OWNER>/test-netdecker-backend:<tag>

Emergency rollback

1. Identify the previous image tag (from registry or local infra).
2. Pull and run previous image as shown above.
3. If DB migrations were applied and are incompatible, follow the migration rollback steps (restore DB backup):

  scripts/backup/restore_postgres.sh /path/to/backup.dump

Diagnostics

- DB connectivity issues: check `pg_isready` and inspect Postgres logs.
- Redis failures: check `redis-cli PING` and Redis logs.

Contacts & escalation
- Developer on-call: (add team contact here)
- Emergency pager/phone: (add if available)

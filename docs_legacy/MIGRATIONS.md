# Database migrations (Prisma) — recommended workflow

This file documents a safe migration workflow for Prisma-based schema changes.

Local development
1. Make schema changes in `backend/prisma/schema.prisma` or create a variant schema for SQLite if needed.
2. Create a migration locally and test it against a local or staging DB:

```sh
cd backend
npx prisma migrate dev --name add-new-field
```

Staging validation
1. Push the migration to the staging DB (use `prisma migrate deploy` against the staging connection string) and run the application integration tests.

Production deploy pattern (safe)
1. Take a backup of production DB (see `scripts/backup/backup_postgres.sh`).
2. Push image to GHCR and tag it.
3. On the host (or via CI SSH step) run:

```sh
# pull image
docker pull ghcr.io/<OWNER>/test-netdecker-backend:<tag>

# optional: run migrations inside a short-lived container that has prisma client available
docker run --rm --env-file /home/<user>/prod.env ghcr.io/<OWNER>/test-netdecker-backend:<tag> npx prisma migrate deploy
```

4. If migrations succeed, start the new container and perform smoke checks.
5. If migrations fail, restore from backup and roll back the container to the previous image.

GitHub Actions snippet (example)

```yaml
# This example runs on a runner and deploys via SSH; adapt to your environment.
jobs:
  migrate-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Run remote backup and migrate + deploy
        uses: appleboy/ssh-action@v0.1.8
        with:
          host: ${{ secrets.PROD_SSH_HOST }}
          username: ${{ secrets.PROD_SSH_USER }}
          key: ${{ secrets.PROD_SSH_KEY }}
          script: |
            set -e
            # backup DB first (script must be present on host or use inline commands)
            /usr/local/bin/backup_postgres.sh /tmp/prod-backup-$(date +%Y%m%d%H%M).dump
            # pull image
            docker pull ghcr.io/${{ github.repository_owner }}/test-netdecker-backend:${{ github.event.inputs.image_tag }}
            # run migrations inside the image
            docker run --rm --env-file /home/${{ secrets.PROD_SSH_USER }}/prod.env ghcr.io/${{ github.repository_owner }}/test-netdecker-backend:${{ github.event.inputs.image_tag }} npx prisma migrate deploy
            # restart app
            docker stop tcg-backend || true
            docker rm tcg-backend || true
            docker run -d --name tcg-backend --env-file /home/${{ secrets.PROD_SSH_USER }}/prod.env -p 3333:3333 ghcr.io/${{ github.repository_owner }}/test-netdecker-backend:${{ github.event.inputs.image_tag }}
```

Notes
- Always test migrations on a staging database with a copy of production data when possible.
- Back up before migrations. If `prisma migrate deploy` fails, restore backup and abort deploy.

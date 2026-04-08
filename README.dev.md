Development setup (local)

Quick start:

1. Start local services (Postgres + Redis):

   docker compose up -d

   - Postgres is mapped to host port 5433 (container 5432).
   - Redis is mapped to host port 6379.

2. Copy the backend environment example and edit if needed:

   cp backend/.env.local.example backend/.env

3. Start the development environment (installs deps, applies schema, seeds, runs servers):

   npm run start:dev

   - This runs `scripts/start-dev.sh` which will:
     - bring up Docker services
     - wait for Postgres to be ready
     - install backend/frontend deps
     - run `prisma:push` and `prisma:seed`
     - start the dev servers

4. Alternative: run both dev servers directly (if deps already installed):

   npm run dev

Notes:

- If port `3334` (backend) or `5433` (Postgres) are already in use, edit `backend/.env` or `docker-compose.yml` accordingly.
- To reapply Prisma schema manually:

   npm --prefix backend run prisma:push
   npm --prefix backend run prisma:seed

- If you prefer not to use Docker, set `DATABASE_URL` and `REDIS_URL` in `backend/.env` to point at an available DB/Redis instance.

SQLite alternative (no Docker)

- Generate a SQLite Prisma client using the included alternate schema:

   ```bash
   # from repo root
   npm --prefix backend run prisma:generate:sqlite
   ```

- Create or edit `backend/.env` and set:

   ```bash
   DATABASE_URL="file:./dev.sqlite"
   ```

- Note: the generated SQLite client will be placed at `backend/node_modules/@prisma/client_sqlite`.
   The application imports the normal `@prisma/client` by default. You can run the backend using the SQLite client by setting an explicit environment variable:

   ```bash
   # use the generated sqlite client at backend/node_modules/@prisma/client_sqlite
   USE_SQLITE=true npm --prefix backend run dev
   ```

   Or ensure `DATABASE_URL="file:./dev.sqlite"` is set and `USE_SQLITE=true` is present. The `backend/src/utils/db.ts` will auto-detect `USE_SQLITE=true` or a `DATABASE_URL` starting with `file:` and load the appropriate client automatically.

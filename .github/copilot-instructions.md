# Project Guidelines

## Architecture

- Monorepo with backend (`backend/`) and frontend (`frontend/`).
- Backend pattern: routes delegate to services; keep business logic in services, not route handlers.
- Prisma is the source of truth for data access and schema (`backend/prisma/schema.prisma`).
- Redis is used for exchange-rate and external API caching; code must tolerate cache misses/timeouts.
- Scheduled automation starts from backend startup (`startPriceSyncCron`, `startCatalogSyncCron`).

## Build And Test

- Install dependencies:
	- Root: `npm install`
	- Backend: `npm --prefix backend install`
	- Frontend: `npm --prefix frontend install`
- Local dev:
	- Full stack: `npm run dev`
	- Backend only: `npm run dev:backend`
	- Frontend only: `npm run dev:frontend`
- Quality checks:
	- Type-check all: `npm run type-check`
	- Backend tests: `npm --prefix backend run test`
	- Frontend tests: `npm --prefix frontend run test:run`
- DB lifecycle:
	- `npm --prefix backend run prisma:push`
	- `npm --prefix backend run prisma:seed`

## Conventions

- Always add explicit TypeScript types for service inputs/outputs and route payloads.
- Prefer service methods for domain operations (`PriceService`, `InventoryService`, `CatalogSyncService`, etc.).
- Validate request input with Zod or equivalent guards before mutating data.
- Keep API responses consistent (`success` + structured error payload from global handler).
- Use custom application errors from `backend/src/utils/errors.ts` instead of ad-hoc throw strings.
- For pricing changes, use `PriceService.updateListingPrice()` to ensure history tracking is preserved.
- For backend-focused edits, follow scoped instruction files: `.github/instructions/backend-routes.instructions.md` and `.github/instructions/backend-services.instructions.md`.
- For frontend API/client and API-consuming page edits, follow: `.github/instructions/frontend-api.instructions.md`.

## Environment And Pitfalls

- Create `backend/.env` from `backend/.env.example` before running backend commands.
- `DATABASE_URL` is required for Prisma operations.
- `REDIS_URL` should be reachable; when unavailable, caching behavior can degrade sync performance.
- Backend default port in code is `3333`; ensure frontend proxy and backend env are aligned.
- Validate cron expressions (`PRICE_SYNC_CRON`, `CATALOG_SYNC_CRON`) when changing schedules.
- After schema changes, run `prisma:push` and `prisma:generate` before testing related flows.

## Reference Docs

- Onboarding and architecture overview: `README.md`
- API/services quick reference: `FUNCIONES_IMPORTANTES.md`
- Open work and priorities: `BACKLOG.md`
- Known issues and pending fixes: `PENDIENTES_MEJORAS_Y_ARREGLOS.md`
- Integration plan: `INTEGRATION_ROADMAP_FUTURE.md`
- External TCG API research: `TCG_DATA_APIS_LATAM_RESEARCH.md`


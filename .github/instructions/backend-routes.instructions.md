---
applyTo: backend/src/routes/**/*.ts
description: "Use when creating or editing backend routes. Enforces thin handlers, schema validation, service delegation, and consistent API response/error patterns."
---

# Backend Route Rules

## Handler Boundaries

- Keep route handlers thin: parse input, call service, shape response.
- Do not place domain/business logic directly in routes.
- Route handlers must delegate domain operations to `backend/src/services/*`.

## Validation

- Validate request inputs at the route boundary (params, query, body).
- Prefer Zod schemas for route payload validation and coercion.
- On invalid input, throw `ValidationError` from `backend/src/utils/errors.ts`.
- Do not rely on downstream Prisma/runtime errors for user-facing validation.

## Response Contract

- Keep successful responses consistent:
  - Either return plain service payload where existing route style already does so.
  - Or return envelope with `success: true` and structured payload when route family uses envelopes.
- Preserve existing response shape per route family to avoid frontend regressions.
- Avoid leaking internal fields or implementation details in responses.

## Error Contract

- Use application errors from `backend/src/utils/errors.ts` (`ValidationError`, `NotFoundError`, `ConflictError`, etc.).
- Do not throw raw strings.
- Use `NotFoundError` for missing resources, not generic `Error`.
- Let global error middleware in `backend/src/index.ts` produce final error envelope.

## Pricing And Inventory Route Safety

- Pricing mutations must go through service-level pricing APIs, especially `PriceService.updateListingPrice()` and relevant service methods.
- Do not duplicate pricing formulas or volatility logic in routes.
- For inventory mutations, validate payloads before service calls and keep batch operations deterministic.

## Type Safety

- Add explicit types for route payloads and parsed values.
- Avoid `any` in request parsing logic unless unavoidable and immediately narrowed.
- Keep route-level helper functions typed (e.g., actor/header extraction helpers).

## Operational Guidance

- Keep logs concise and high-signal.
- Prefer stable endpoint behavior over ad-hoc shape changes.
- When adding endpoints, include short route comments documenting method, path, and expected payload.

---
applyTo: backend/src/services/**/*.ts
description: "Use when creating or editing backend services. Enforces typed IO, validation, application errors, and PriceService-safe pricing updates."
---

# Backend Service Rules

## Typed IO

- Define explicit TypeScript types or interfaces for service inputs and outputs.
- Do not use implicit `any` for function params, return values, or intermediate payloads.
- Keep service method signatures stable and strongly typed, including optional fields.
- Return domain data (typed objects), not HTTP-layer objects (`req`, `res`, status codes).

## Validation

- Validate untrusted input as early as possible in service boundaries.
- Prefer Zod schemas for structured payload validation and normalization.
- Convert validation failures to `ValidationError` from `backend/src/utils/errors.ts`.
- Avoid silent coercions unless explicitly defined by schema/transforms.

## Error Handling

- Use custom application errors from `backend/src/utils/errors.ts` (`ValidationError`, `NotFoundError`, `ConflictError`, etc.).
- Do not throw raw strings.
- Avoid generic `Error` when a domain-specific error class applies.
- Include precise, actionable error messages that can be surfaced in API responses.

## Pricing Rules

- Do not recalculate listing prices inline in services.
- For listing price mutations, use `PriceService.updateListingPrice()` so history and sync metadata are preserved.
- For preview/debug calculations, use `PriceService.calculateFinalPrice()` or `PriceService.calculateFinalPriceDetailed()`.
- Use `PriceService.isVolatileChange()` for volatility checks; do not duplicate threshold logic.

## Service Design

- Keep business logic in services; routes should orchestrate and delegate.
- Keep methods focused: one clear domain responsibility per method.
- Use Prisma queries with explicit select/include where practical to control payload shape.
- Preserve transactional integrity for multi-step write operations.

## Side Effects And Observability

- Log operationally significant failures with enough context to debug sync/import flows.
- Avoid noisy logs inside hot loops unless required for diagnostics.
- Preserve backward-compatible behavior unless the task explicitly requires a breaking change.

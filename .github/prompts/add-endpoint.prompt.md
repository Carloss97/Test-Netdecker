---
name: "Add Endpoint"
description: "Scaffold a new backend endpoint end-to-end: route + service + tests + frontend client wiring."
argument-hint: "Feature intent; method/path; request/response shape; frontend consumer page"
agent: "agent"
---
Create a new endpoint end-to-end for this workspace.

Use the user arguments as the source of truth, then implement all required code changes directly.

## Inputs To Extract From Arguments

- Business goal of the endpoint
- HTTP method and path (for example: `POST /api/admin/foo`)
- Request payload shape (body/query/params)
- Response shape (success and key fields)
- Whether this endpoint is admin-only or public
- Frontend page or flow that will consume it

If any of the above is missing, infer safe defaults from existing route patterns and continue.

## Required Implementation Steps

1. Backend service
- Add/update service method in `backend/src/services` with explicit typed input/output.
- Keep domain logic in services; do not embed business logic in route handlers.
- Validate service-level untrusted input with Zod when appropriate.
- Use application errors from `backend/src/utils/errors.ts`.
- For pricing mutations, use `PriceService.updateListingPrice()` (do not recalculate inline).

2. Backend route
- Add/update route file in `backend/src/routes`.
- Keep handler thin: parse/validate, call service, return response.
- Use Zod validation for request payloads.
- Preserve existing response conventions for that route family.

3. Tests
- Add/update backend tests for:
  - happy path
  - validation failure(s)
  - not found/conflict path if relevant
- If endpoint affects frontend page behavior, add/update frontend test coverage for loading/error/success states.

4. Frontend API client wiring
- Add/update typed client method in `frontend/src/services` through `apiClient`.
- Do not call fetch/axios directly from pages.

5. Frontend consumer wiring
- Update target page/component in `frontend/src/pages` to use the new client.
- Include explicit loading/error/empty/success handling where relevant.

6. Verification
- Run focused type-check/tests for touched areas.
- Report what was run and the result.

## Codebase Conventions To Follow

- Workspace guidance: [.github/copilot-instructions.md](../copilot-instructions.md)
- Backend routes guidance: [.github/instructions/backend-routes.instructions.md](../instructions/backend-routes.instructions.md)
- Backend services guidance: [.github/instructions/backend-services.instructions.md](../instructions/backend-services.instructions.md)
- Frontend API/page guidance: [.github/instructions/frontend-api.instructions.md](../instructions/frontend-api.instructions.md)

## Output Format In Final Response

- `Implemented endpoint`: method + path + short purpose
- `Files changed`: concise list grouped by backend/frontend/tests
- `Validation run`: commands + pass/fail summary
- `Notes`: assumptions/defaults inferred from missing inputs

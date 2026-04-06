---
applyTo:
  - frontend/src/services/**/*.ts
  - frontend/src/pages/**/*.tsx
description: "Use when creating or editing frontend API clients or API-consuming pages. Enforces consistent loading/error handling, typed responses, and stable client/page contracts."
---

# Frontend API And UI Fetching Rules

## Scope

- Applies to API client modules in `frontend/src/services/**/*.ts`.
- Applies to pages that consume APIs in `frontend/src/pages/**/*.tsx`.

## API Client Conventions (`services`)

- Centralize HTTP calls through `apiClient` (`frontend/src/services/api.ts`), not ad-hoc fetch calls in pages.
- Define explicit TypeScript input/output types for each client function.
- Keep client functions small and deterministic: map request params/body and return typed data only.
- Preserve existing endpoint response shapes unless backend changes require a coordinated update.
- Prefer named helper functions (`getX`, `createX`, `updateX`, `deleteX`) with clear parameter names.

## Page Conventions (`pages`)

- Pages should call service functions, not raw axios/fetch directly.
- Always represent request lifecycle states for async UI:
  - Loading: visible pending state (spinner/skeleton/message).
  - Error: clear, actionable message with retry path when practical.
  - Empty: explicit empty-state copy when successful but no data.
  - Success: stable rendering with safe null/undefined handling.
- Keep API state local to page or hook (`loading`, `error`, `data`) and avoid hidden implicit state transitions.

## Error Handling

- Treat network/API failures as expected states, not exceptional crashes.
- Convert unknown errors to user-friendly text in pages.
- Do not leak raw stack traces or internal backend details to UI.
- Keep error copy consistent and localized with the page language style.

## Loading And Refresh Patterns

- Use explicit `loading` flags around async actions.
- Disable or debounce repeat-trigger UI actions while request is in flight.
- Provide retry actions for primary fetch flows.
- Avoid stale-data confusion: clear or visibly mark stale state during refreshes.

## Type Safety

- Avoid `any` for API payloads and response handling.
- Prefer shared domain types from `frontend/src/types` where possible.
- Narrow optional fields before rendering and provide safe fallbacks.

## Contract Stability

- If backend response shape changes, update:
  - Client method types and mapping.
  - All consuming pages/components.
  - Relevant tests.
- Avoid silent partial migrations that leave mixed response assumptions across pages.

## Testing Expectations

- For API-consuming pages, add or update tests that cover:
  - Loading transition.
  - Error handling.
  - Empty-state behavior.
  - At least one success rendering path.
- Mock service-layer functions in page tests rather than mocking low-level HTTP directly.

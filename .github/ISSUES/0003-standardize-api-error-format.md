# Standardize API error format across endpoints

Description

Unify error responses to the established format `{ success: false, error: { code, message, statusCode, timestamp } }` and ensure all services and routes use `ApplicationError` derived classes.

Acceptance criteria

- All route handlers and services return the standardized error payload.
- Existing ad-hoc throws replaced with application error classes.
- Tests added to validate normalized error responses.

Reference

Source: BACKLOG.md — "Estandarizar manejo de errores con códigos y formato único".
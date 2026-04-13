# Implement TTL for cart reservations (expire reserved stock)

Description

Add TTL and cleanup job for cart reservations to avoid long-held reserved stock causing over-reservation.

Acceptance criteria

- Reservation record includes expiration timestamp.
- Cleanup job removes expired reservations and returns stock.
- Tests for concurrency and race conditions.

Reference

Source: BACKLOG.md — "Reserva temporal de stock con expiración de carrito (TTL)".
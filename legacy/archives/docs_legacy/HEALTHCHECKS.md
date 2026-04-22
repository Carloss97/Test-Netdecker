# Health & readiness checks

This file documents recommended health and readiness checks for the backend service.

HTTP endpoints
- `/api/health` — lightweight liveness check (should return status = ok).
- `/api/ready` — readiness check (ensures DB and Redis connections are healthy before marking service ready).

Express example (add to `backend/src/routes` or a small middleware):

```ts
import express from 'express';
import prisma from '../utils/db';
import { createClient } from 'redis';

const router = express.Router();

router.get('/health', (_req, res) => res.json({ status: 'ok' }));

router.get('/ready', async (_req, res) => {
  try {
    await prisma.$connect();
    // Optionally ping Redis
    res.json({ ready: true });
  } catch (err) {
    res.status(503).json({ ready: false, error: String(err) });
  }
});

export default router;
```

Docker healthcheck example (docker-compose or Dockerfile):

```yaml
healthcheck:
  test: ["CMD-SHELL", "curl -f http://localhost:3333/api/health || exit 1"]
  interval: 30s
  timeout: 5s
  retries: 3
```

Kubernetes readiness/liveness
- Map the above endpoints to the appropriate `livenessProbe` and `readinessProbe`.

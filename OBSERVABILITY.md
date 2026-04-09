# Observability (errors + metrics)

This document describes minimal recommendations to add error tracking and metrics to the backend.

Error tracking (Sentry)
- Add `SENTRY_DSN` to production env.
- Install `@sentry/node` in the backend and initialize early in `backend/src/index.ts` (or a new `backend/src/utils/sentry.ts`). Example:

```ts
import * as Sentry from '@sentry/node';

export function initSentry() {
  if (!process.env.SENTRY_DSN) return;
  Sentry.init({ dsn: process.env.SENTRY_DSN });
}
```

Metrics (Prometheus)
- Use `prom-client` to expose metrics and a `/metrics` endpoint.
- Basic example:

```ts
import client from 'prom-client';
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 5000 });

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});
```

Tracing and dashboards
- Send metrics to Prometheus + Grafana for dashboards.
- Use Sentry for error aggregation and performance tracing.

Notes
- Adding these libs requires updating `backend/package.json` and running `npm install`. For low-friction rollout, start by adding `SENTRY_DSN` and initializing Sentry conditionally.

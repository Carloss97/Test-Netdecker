import express, { Request, Response } from 'express';

export function createMetricsRouter(promModule?: any) {
  const router = express.Router();

  router.get('/', async (_req: Request, res: Response) => {
    try {
      const prom = promModule ?? (await import('prom-client'));

      // Ensure default metrics are being collected (no-op if already set)
      try {
        prom.collectDefaultMetrics?.();
      } catch (e) {
        // ignore errors from duplicate registration
      }

      res.set('Content-Type', (prom.register as any).contentType || 'text/plain');
      const metrics = await (prom.register as any).metrics();
      res.send(metrics);
    } catch (err) {
      res.status(503).send('prom-client not available');
    }
  });

  return router;
}

export default createMetricsRouter();

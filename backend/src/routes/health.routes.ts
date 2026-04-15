// src/routes/health.routes.ts
import express, { Request, Response } from 'express';
import { ApplicationError } from '../utils/errors.js';

const router = express.Router();

router.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Readiness probe: checks DB and Redis availability
router.get('/ready', async (_req: Request, res: Response) => {
  // Check DB (Prisma) connectivity
  try {
    const dbMod = await import('../utils/db.js');
    const db = dbMod.default;
    if (!db || typeof db.$connect !== 'function') {
      throw new ApplicationError(503, 'DB client not available', 'SERVICE_UNAVAILABLE');
    }
    // Attempt a lightweight connect (no-op if already connected)
    await db.$connect();
  } catch (err) {
    return res.status(503).json({ success: false, service: 'database', message: 'Database unavailable' });
  }

  // Check Redis (optional)
  try {
    const redisMod = await import('../utils/redis.js');
    if (redisMod && typeof redisMod.getRedisClient === 'function') {
      const client = await redisMod.getRedisClient();
      // many redis clients expose ping
      if (typeof (client as any).ping === 'function') {
        await (client as any).ping();
      }
    }
  } catch (err) {
    // Redis is optional; respond degraded but allow ready if DB is ok
    return res.status(200).json({ success: true, message: 'ready (redis unavailable)' });
  }

  return res.status(200).json({ success: true, message: 'ready' });
});

export default router;

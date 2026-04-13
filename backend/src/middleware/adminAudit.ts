import { Request, Response, NextFunction } from 'express';
import AuditService from '../services/AuditService.js';

export default function adminAudit(req: Request, _res: Response, next: NextFunction) {
  const start = Date.now();
  const user = (req as any).adminUser;

  _res.on('finish', async () => {
    try {
      await AuditService.logAction({
        userId: user?.id ?? null,
        action: `${req.method} ${req.path}`,
        data: {
          body: req.body,
          query: req.query,
          statusCode: (_res as any).statusCode,
          durationMs: Date.now() - start,
        },
        ip: req.ip,
        userAgent: String(req.headers['user-agent'] || ''),
      });
    } catch (err) {
      // already handled inside AuditService
    }
  });

  return next();
}

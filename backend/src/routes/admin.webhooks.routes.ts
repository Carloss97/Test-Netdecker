import express, { Request, Response } from 'express';
import { ValidationError } from '../utils/errors.js';
import WebhookQueueService from '../services/WebhookQueueService.js';
import requirePermission from '../middleware/requirePermission.js';

const router = express.Router();

router.get('/dlq', requirePermission('view', 'webhooks'), async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit || 50) || 50, 200);
  const items = await WebhookQueueService.getDeadLetterItems(limit);
  res.json({ success: true, total: items.length, items });
});

router.post('/dlq/:id/retry', requirePermission('retry', 'webhooks'), async (req: Request, res: Response) => {
  const deadLetterId = String(req.params.id || '').trim();
  if (!deadLetterId) {
    throw new ValidationError('Dead letter id is required');
  }

  const admin = (req as any).adminUser as { id: string } | undefined;
  const result = await WebhookQueueService.retryDeadLetterItem(deadLetterId, admin?.id || null);
  res.json({ success: true, ...result });
});

export default router;
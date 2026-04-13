import { Router, Request, Response } from 'express';
import requireApiKey from '../middleware/requireApiKey.js';
import PriceApprovalService from '../services/PriceApprovalService.js';

const router = Router();

router.get('/approvals', requireApiKey, async (_req: Request, res: Response) => {
  const rows = await PriceApprovalService.listPending();
  res.json({ success: true, data: rows });
});

router.post('/approvals/:id/approve', requireApiKey, async (req: Request, res: Response) => {
  const { id } = req.params;
  const processedBy = req.body.processedBy || (req.headers['x-user'] as string | undefined) || 'api';
  const updated = await PriceApprovalService.approve(id, processedBy);
  res.json({ success: true, data: updated });
});

router.post('/approvals/:id/reject', requireApiKey, async (req: Request, res: Response) => {
  const { id } = req.params;
  const processedBy = req.body.processedBy || (req.headers['x-user'] as string | undefined) || 'api';
  const notes = req.body.notes as string | undefined;
  const updated = await PriceApprovalService.reject(id, processedBy, notes);
  res.json({ success: true, data: updated });
});

export default router;

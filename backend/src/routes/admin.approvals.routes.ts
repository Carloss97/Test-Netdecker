import express, { Request, Response } from 'express';
import PriceApprovalService from '../services/PriceApprovalService.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import requirePermission from '../middleware/requirePermission.js';

const router = express.Router();

// GET /api/admin/approvals/pending
router.get('/pending', requirePermission('view', 'price-approval'), async (req: Request, res: Response) => {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || '50'), 10) || 50, 1), 200);
  const rows = await PriceApprovalService.listPending(limit);
  res.json({ success: true, total: rows.length, approvals: rows });
});

// POST /api/admin/approvals/:id/approve
router.post('/:id/approve', requirePermission('approve', 'price'), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const processedBy = typeof req.body.processedBy === 'string' ? String(req.body.processedBy) : undefined;
  try {
    const updated = await PriceApprovalService.approve(id, processedBy);
    res.json({ success: true, approval: updated });
  } catch (err: unknown) {
    throw new ValidationError((err as Error).message || 'Unable to approve');
  }
});

// POST /api/admin/approvals/:id/reject
router.post('/:id/reject', requirePermission('reject', 'price'), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const processedBy = typeof req.body.processedBy === 'string' ? String(req.body.processedBy) : undefined;
  const notes = typeof req.body.notes === 'string' ? String(req.body.notes) : undefined;

  try {
    const updated = await PriceApprovalService.reject(id, processedBy, notes);
    res.json({ success: true, approval: updated });
  } catch (err: unknown) {
    throw new ValidationError((err as Error).message || 'Unable to reject');
  }
});

export default router;

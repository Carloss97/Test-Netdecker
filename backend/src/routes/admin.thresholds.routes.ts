import express, { Request, Response } from 'express';
import prisma from '../utils/db.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import requirePermission from '../middleware/requirePermission.js';

const router = express.Router();

// GET /api/admin/pricing/thresholds?tcg=MAGIC&editionId=...
router.get('/', requirePermission('view', 'threshold'), async (req: Request, res: Response) => {
  const tcg = typeof req.query.tcg === 'string' && req.query.tcg ? String(req.query.tcg) : undefined;
  const editionId = typeof req.query.editionId === 'string' && req.query.editionId ? String(req.query.editionId) : undefined;

  const where: any = {};
  if (tcg) where.tcg = tcg;
  if (editionId) where.editionId = editionId;

  const rows = await prisma.priceVolatilityThreshold.findMany({ where, orderBy: { createdAt: 'desc' } });
  res.json({ success: true, total: rows.length, thresholds: rows });
});

// POST /api/admin/pricing/thresholds
router.post('/', requirePermission('create', 'threshold'), async (req: Request, res: Response) => {
  const { tcg, editionId, thresholdPercent } = req.body as { tcg?: string; editionId?: string; thresholdPercent?: number };

  if (typeof thresholdPercent !== 'number' || !Number.isFinite(thresholdPercent) || thresholdPercent <= 0) {
    throw new ValidationError('thresholdPercent must be a positive number');
  }

  const created = await prisma.priceVolatilityThreshold.create({ data: { tcg: tcg || null, editionId: editionId || null, thresholdPercent } });
  res.json({ success: true, threshold: created });
});

// PATCH /api/admin/pricing/thresholds/:id
router.patch('/:id', requirePermission('update', 'threshold'), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { tcg, editionId, thresholdPercent } = req.body as { tcg?: string; editionId?: string; thresholdPercent?: number };

  const existing = await prisma.priceVolatilityThreshold.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Threshold not found');

  const data: any = {};
  if (tcg !== undefined) data.tcg = tcg || null;
  if (editionId !== undefined) data.editionId = editionId || null;
  if (thresholdPercent !== undefined) {
    if (typeof thresholdPercent !== 'number' || !Number.isFinite(thresholdPercent) || thresholdPercent <= 0) {
      throw new ValidationError('thresholdPercent must be a positive number');
    }
    data.thresholdPercent = thresholdPercent;
  }

  try {
    const updated = await prisma.priceVolatilityThreshold.update({ where: { id }, data });
    res.json({ success: true, threshold: updated });
  } catch (err: unknown) {
    throw new ValidationError((err as Error).message || 'Unable to update threshold');
  }
});

// DELETE /api/admin/pricing/thresholds/:id
router.delete('/:id', requirePermission('delete', 'threshold'), async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const existing = await prisma.priceVolatilityThreshold.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Threshold not found');
  await prisma.priceVolatilityThreshold.delete({ where: { id } });
  res.json({ success: true });
});

export default router;

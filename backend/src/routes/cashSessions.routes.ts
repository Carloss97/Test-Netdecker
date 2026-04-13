import express from 'express';
import { z } from 'zod';
import CashSessionService from '../services/CashSessionService.js';

const router = express.Router();

const openSchema = z.object({ storeId: z.string().optional(), openedBy: z.string().optional(), startingCash: z.coerce.number().optional() });
const closeSchema = z.object({ closedBy: z.string().optional(), endingCash: z.coerce.number().optional() });

router.post('/', async (req, res) => {
  const parsed = openSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'Invalid payload' });

  const session = await CashSessionService.openSession(parsed.data as any);
  res.json({ success: true, session });
});

router.post('/:id/close', async (req, res) => {
  const parsed = closeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'Invalid payload' });

  const id = String(req.params.id);
  const updated = await CashSessionService.closeSession(id, parsed.data as any);
  res.json({ success: true, session: updated });
});

router.get('/:id', async (req, res) => {
  const id = String(req.params.id);
  const session = await CashSessionService.getSessionById(id);
  res.json({ success: true, session });
});

export default router;

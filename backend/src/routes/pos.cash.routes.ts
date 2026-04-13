import express from 'express';
import { z } from 'zod';
import CashSessionService from '../services/CashSessionService.js';
import { ValidationError } from '../utils/errors.js';

const router = express.Router();

const openSchema = z.object({ cashierId: z.string().optional(), storeId: z.string().optional(), startingBalance: z.number().optional(), notes: z.string().optional() });
const closeSchema = z.object({ endingBalance: z.number().optional(), notes: z.string().optional() });

router.post('/', async (req, res) => {
  const parsed = openSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message || 'Invalid payload');

  const session = await CashSessionService.openSession(parsed.data as any);
  res.json({ success: true, session });
});

router.post('/:id/close', async (req, res) => {
  const parsed = closeSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message || 'Invalid payload');

  const id = String(req.params.id);
  const result = await CashSessionService.closeSession(id, parsed.data as any);
  res.json({ success: true, result });
});

router.get('/', async (req, res) => {
  const storeId = req.query.storeId ? String(req.query.storeId) : undefined;
  const sessions = await CashSessionService.listSessions(storeId);
  res.json({ success: true, sessions });
});

export default router;

import express, { Request, Response } from 'express';
import { z } from 'zod';
import PosService from '../services/PosService.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';

const router = express.Router();

const createSessionSchema = z.object({
  storeId: z.string().optional(),
  userId: z.string().optional(),
  items: z.any().optional(),
  subtotal: z.coerce.number().optional(),
  tax: z.coerce.number().optional(),
  total: z.coerce.number().optional(),
  status: z.enum(['OPEN', 'CLOSED', 'CANCELLED']).optional(),
});

const transactionSchema = z.object({
  method: z.enum(['CASH', 'CARD', 'STRIPE', 'MERCADOPAGO', 'OTHER']).optional(),
  amount: z.coerce.number().min(0, 'amount must be >= 0'),
  status: z.enum(['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED']).optional(),
  processorResponse: z.any().optional(),
  processorReference: z.string().optional(),
});

function parseBodyOrThrow<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message || 'Invalid request payload');
  return parsed.data;
}

router.post('/sessions', async (req: Request, res: Response) => {
  const body = parseBodyOrThrow(createSessionSchema, req.body);
  const session = await PosService.createSession(body as any);
  res.json({ success: true, session });
});

router.get('/sessions/:sessionId', async (req: Request, res: Response) => {
  const session = await PosService.getSessionByPublicId(String(req.params.sessionId));
  if (!session) throw new NotFoundError('POS session not found');
  res.json({ success: true, session });
});

router.post('/sessions/:sessionId/transactions', async (req: Request, res: Response) => {
  const body = parseBodyOrThrow(transactionSchema, req.body);
  const tx = await PosService.createTransaction(String(req.params.sessionId), body as any);
  res.json({ success: true, transaction: tx });
});

router.get('/sessions/:sessionId/transactions', async (req: Request, res: Response) => {
  const txs = await PosService.listTransactions(String(req.params.sessionId));
  res.json({ success: true, transactions: txs });
});

export default router;

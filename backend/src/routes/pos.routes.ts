import express, { Request, Response } from 'express';
import { z } from 'zod';
import PosService from '../services/PosService.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/errors.js';
import requireAdmin from '../middleware/requireAdmin.js';
import requirePermission from '../middleware/requirePermission.js';

const router = express.Router();

const createSessionSchema = z.object({
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

// Global requirement for POS
router.use(requireAdmin);

router.post('/sessions', requirePermission('create', 'pos-session'), async (req: Request, res: Response) => {
  const admin = (req as any).adminUser;
  if (!admin) throw new ForbiddenError('Not authenticated');

  const body = parseBodyOrThrow(createSessionSchema, req.body);
  
  // Enforce storeId and userId from authenticated session
  const session = await PosService.createSession({
    ...body,
    storeId: admin.storeId || String(req.header('x-store-id') || '').trim() || null,
    userId: admin.id,
  });
  
  res.json({ success: true, session });
});

router.get('/sessions/:sessionId', requirePermission('view', 'pos-session'), async (req: Request, res: Response) => {
  const session = await PosService.getSessionByPublicId(String(req.params.sessionId));
  if (!session) throw new NotFoundError('POS session not found');
  res.json({ success: true, session });
});

router.post('/sessions/:sessionId/transactions', requirePermission('create', 'pos-transaction'), async (req: Request, res: Response) => {
  const body = parseBodyOrThrow(transactionSchema, req.body);
  const tx = await PosService.createTransaction(String(req.params.sessionId), body as any);
  res.json({ success: true, transaction: tx });
});

router.post('/sessions/:sessionId/complete', requirePermission('update', 'pos-session'), async (req: Request, res: Response) => {
  const result = await PosService.completeSession(String(req.params.sessionId));
  res.json({ success: true, ...result });
});

router.get('/sessions/:sessionId/transactions', requirePermission('view', 'pos-transaction'), async (req: Request, res: Response) => {
  const txs = await PosService.listTransactions(String(req.params.sessionId));
  res.json({ success: true, transactions: txs });
});

export default router;

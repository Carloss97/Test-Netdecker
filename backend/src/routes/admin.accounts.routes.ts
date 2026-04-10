import express, { Request, Response } from 'express';
import prisma from '../utils/db.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';

const router = express.Router();

// GET /api/admin/accounts?storeId=...
router.get('/', async (req: Request, res: Response) => {
  const storeId = typeof req.query.storeId === 'string' && req.query.storeId ? String(req.query.storeId) : undefined;
  const accounts = await prisma.account.findMany({ where: { storeId: storeId ?? undefined }, orderBy: { code: 'asc' } });
  res.json({ success: true, total: accounts.length, accounts });
});

// POST /api/admin/accounts
router.post('/', async (req: Request, res: Response) => {
  const { storeId, code, name, type, description } = req.body as { storeId?: string; code?: string; name?: string; type?: string; description?: string };

  if (!code || !name || !type) throw new ValidationError('code, name and type are required');

  const allowed = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
  if (!allowed.includes(type)) throw new ValidationError('Invalid account type');

  const created = await prisma.account.create({ data: { storeId: storeId || null, code: String(code).trim(), name: String(name).trim(), type: String(type) as any, description: description || null } });
  res.json({ success: true, account: created });
});

export default router;

import express, { Request, Response } from 'express';
import prisma from '../utils/db.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import requirePermission from '../middleware/requirePermission.js';

const router = express.Router();

// GET /api/admin/accounts?storeId=...
router.get('/', requirePermission('view', 'account'), async (req: Request, res: Response) => {
  const storeId = typeof req.query.storeId === 'string' && req.query.storeId ? String(req.query.storeId) : undefined;
  const accounts = await prisma.account.findMany({ where: { storeId: storeId ?? undefined }, orderBy: { code: 'asc' } });
  res.json({ success: true, total: accounts.length, accounts });
});

// POST /api/admin/accounts
router.post('/', requirePermission('create', 'account'), async (req: Request, res: Response) => {
  const { storeId, code, name, type, description } = req.body as { storeId?: string; code?: string; name?: string; type?: string; description?: string };

  if (!code || !name || !type) throw new ValidationError('code, name and type are required');

  const allowed = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
  if (!allowed.includes(type)) throw new ValidationError('Invalid account type');

  const created = await prisma.account.create({ data: { storeId: storeId || null, code: String(code).trim(), name: String(name).trim(), type: String(type) as any, description: description || null } });
  res.json({ success: true, account: created });
});

// PATCH /api/admin/accounts/:id
router.patch('/:id', requirePermission('update', 'account'), async (req: Request, res: Response) => {
  const id = req.params.id;
  const { storeId, code, name, type, description } = req.body as { storeId?: string; code?: string; name?: string; type?: string; description?: string };

  const existing = await prisma.account.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Account not found');

  const allowed = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
  if (type && !allowed.includes(type)) throw new ValidationError('Invalid account type');

  const data: any = {};
  if (storeId !== undefined) data.storeId = storeId || null;
  if (code !== undefined) data.code = String(code).trim();
  if (name !== undefined) data.name = String(name).trim();
  if (type !== undefined) data.type = String(type);
  if (description !== undefined) data.description = description || null;

  try {
    const updated = await prisma.account.update({ where: { id }, data });
    res.json({ success: true, account: updated });
  } catch (err: unknown) {
    throw new ValidationError((err as Error).message || 'Unable to update account');
  }
});

// DELETE /api/admin/accounts/:id
router.delete('/:id', requirePermission('delete', 'account'), async (req: Request, res: Response) => {
  const id = req.params.id;

  const existing = await prisma.account.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Account not found');

  // Prevent deleting accounts referenced by journal lines
  const used = await prisma.journalLine.findFirst({ where: { accountId: id } });
  if (used) throw new ValidationError('Account is used in journal entries and cannot be deleted');

  await prisma.account.delete({ where: { id } });
  res.json({ success: true });
});

export default router;

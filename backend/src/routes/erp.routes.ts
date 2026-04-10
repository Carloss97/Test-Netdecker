import express, { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/db.js';
import { InventoryService } from '../services/InventoryService.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';

const router = express.Router();

const movementSchema = z.object({
  listingId: z.string({ required_error: 'listingId is required' }).trim().min(1),
  warehouseId: z.string().optional(),
  fromWarehouseId: z.string().optional(),
  toWarehouseId: z.string().optional(),
  quantity: z.coerce.number().int('quantity must be integer'),
  type: z.enum(['IN', 'OUT', 'TRANSFER', 'ADJUST']),
  reference: z.string().optional(),
  performedBy: z.string().optional(),
  notes: z.string().optional(),
});

const snapshotSchema = z.object({
  listingId: z.string({ required_error: 'listingId is required' }).trim().min(1),
  warehouseId: z.string().optional(),
});

function parseBodyOrThrow<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message || 'Invalid request payload');
  return parsed.data;
}

router.post('/stock/movement', async (req: Request, res: Response) => {
  const body = parseBodyOrThrow(movementSchema, req.body);
  const movement = await InventoryService.recordStockMovement(body as any);
  res.json({ success: true, movement });
});

router.post('/stock/snapshot', async (req: Request, res: Response) => {
  const { listingId, warehouseId } = parseBodyOrThrow(snapshotSchema, req.body);
  const snapshot = await InventoryService.takeStockSnapshot(listingId, warehouseId || null);
  res.json({ success: true, snapshot });
});

router.get('/stock/:listingId', async (req: Request, res: Response) => {
  const listing = await prisma.listing.findUnique({ where: { id: String(req.params.listingId) } });
  if (!listing) throw new NotFoundError('Listing not found');

  const snapshots = await prisma.stockSnapshot.findMany({ where: { listingId: listing.id }, orderBy: { takenAt: 'desc' }, take: 20 });

  res.json({ success: true, listing, snapshots });
});

export default router;

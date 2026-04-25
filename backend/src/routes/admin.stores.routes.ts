import express, { Request, Response } from 'express';
import StoreService from '../services/StoreServiceImpl.js';
import prisma from '../utils/db.js';
import { ForbiddenError, ValidationError } from '../utils/errors.js';
import requirePermission from '../middleware/requirePermission.js';

const router = express.Router();

function getScopedStoreId(req: Request): string | undefined {
  const raw = (req as any).adminUser?.storeId;
  const normalized = typeof raw === 'string' ? raw.trim() : '';
  return normalized || undefined;
}

function assertGlobalAdmin(req: Request): void {
  if (getScopedStoreId(req)) {
    throw new ForbiddenError('Only global admin can manage stores');
  }
}

/**
 * POST /api/admin/stores
 * Body: { slug, name, description? }
 * Returns: { store: { id, slug, name }, apiKey }
 */
router.post('/', requirePermission('create', 'store'), async (req: Request, res: Response) => {
  assertGlobalAdmin(req);

  const slug = req.body?.slug ? String(req.body.slug).trim().toLowerCase() : undefined;
  const name = req.body?.name ? String(req.body.name).trim() : undefined;
  const description = req.body?.description ? String(req.body.description) : undefined;
  const currency = req.body?.currency ? String(req.body.currency).trim() : undefined;
  const taxRate = req.body?.taxRate !== undefined ? Number(req.body.taxRate) : undefined;
  const settings = req.body?.settings !== undefined ? req.body.settings : undefined;

  if (!slug || !name) throw new ValidationError('slug and name are required');

  const { store, apiKey } = await StoreService.createStore({ slug, name, description, currency, taxRate, settings } as any);
  res.json({
    success: true,
    store: { id: store.id, slug: store.slug, name: store.name },
    apiKey,
  });
});

/**
 * POST /api/admin/stores/:id/rotate-key
 * Returns: { apiKey }
 */
router.post('/:id/rotate-key', requirePermission('rotate', 'store-key'), async (req: Request, res: Response) => {
  assertGlobalAdmin(req);

  const storeId = req.params.id;
  if (!storeId) throw new ValidationError('store id required');

  const result = await StoreService.rotateApiKey(storeId);
  res.json({ success: true, apiKey: result.apiKey });
});

/**
 * GET /api/admin/stores
 * List known stores
 */
router.get('/', requirePermission('view', 'store'), async (req: Request, res: Response) => {
  const scopedStoreId = getScopedStoreId(req);
  let stores: Array<{ id: string; slug: string; name: string }> = [];

  if (scopedStoreId) {
    const store = await prisma.store.findUnique({
      where: { id: scopedStoreId },
      select: { id: true, slug: true, name: true },
    });
    stores = store ? [store] : [];
  } else {
    const allStores = await StoreService.listStores();
    stores = allStores.map((s: any) => ({ id: s.id, slug: s.slug, name: s.name }));
  }

  res.json({ success: true, total: stores.length, stores });
});

// PATCH /api/admin/stores/:id - update store configuration (currency, taxRate, settings, name, description)
router.patch('/:id', requirePermission('update', 'store'), async (req: Request, res: Response) => {
  assertGlobalAdmin(req);

  const storeId = req.params.id;
  if (!storeId) throw new ValidationError('store id required');

  const payload: any = {};
  if (req.body?.name !== undefined) payload.name = String(req.body.name);
  if (req.body?.description !== undefined) payload.description = String(req.body.description);
  if (req.body?.currency !== undefined) payload.currency = String(req.body.currency).trim();
  if (req.body?.taxRate !== undefined) payload.taxRate = Number(req.body.taxRate);
  if (req.body?.settings !== undefined) payload.settings = req.body.settings;

  const updated = await StoreService.updateStore(storeId, payload);
  res.json({ success: true, store: { id: updated.id, slug: updated.slug, name: updated.name, currency: updated.currency, taxRate: updated.taxRate } });
});

export default router;

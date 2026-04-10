import express, { Request, Response } from 'express';
import requireApiKey from '../middleware/requireApiKey.js';
import StoreService from '../services/StoreServiceImpl.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';

const router = express.Router();

/**
 * POST /api/admin/stores
 * Body: { slug, name, description? }
 * Returns: { store: { id, slug, name }, apiKey }
 */
router.post('/', requireApiKey, async (req: Request, res: Response) => {
  const slug = req.body?.slug ? String(req.body.slug).trim().toLowerCase() : undefined;
  const name = req.body?.name ? String(req.body.name).trim() : undefined;
  const description = req.body?.description ? String(req.body.description) : undefined;

  if (!slug || !name) throw new ValidationError('slug and name are required');

  const { store, apiKey } = await StoreService.createStore({ slug, name, description });
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
router.post('/:id/rotate-key', requireApiKey, async (req: Request, res: Response) => {
  const storeId = req.params.id;
  if (!storeId) throw new ValidationError('store id required');

  const result = await StoreService.rotateApiKey(storeId);
  res.json({ success: true, apiKey: result.apiKey });
});

/**
 * GET /api/admin/stores
 * List known stores
 */
router.get('/', requireApiKey, async (_req: Request, res: Response) => {
  const stores = await StoreService.listStores();
  res.json({ success: true, total: stores.length, stores: stores.map((s: any) => ({ id: s.id, slug: s.slug, name: s.name })) });
});

export default router;

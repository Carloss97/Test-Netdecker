// src/routes/inventory.routes.ts
import express, { Request, Response } from 'express';
import { ListingService } from '../services/ListingService.js';
// @ts-ignore - .js extension is required for Node ESM runtime after build.
import { InventoryService } from '../services/InventoryService.js';
import multer from 'multer';
import { z } from 'zod';
import requireApiKey from '../middleware/requireApiKey.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const updateQuantitySchema = z.object({
  listingId: z.string({ required_error: 'listingId is required', invalid_type_error: 'listingId is required' }).trim().min(1, 'listingId is required'),
  quantity: z.coerce.number().int('quantity must be an integer').min(0, 'quantity must be >= 0'),
});

const bulkUpdateSchema = z.object({
  updates: z.array(
    z.object({
      listingId: z.string({ required_error: 'listingId is required', invalid_type_error: 'listingId is required' }).trim().min(1, 'listingId is required'),
      quantity: z.coerce.number().int('quantity must be an integer').min(0, 'quantity must be >= 0'),
    })
  ).min(1, 'updates must be a non-empty array of { listingId, quantity }'),
});

const decreaseQuantitySchema = z.object({
  listingId: z.string({ required_error: 'listingId is required', invalid_type_error: 'listingId is required' }).trim().min(1, 'listingId is required'),
  amount: z.coerce.number().int('amount must be an integer').positive('amount must be > 0'),
});

function parseBodyOrThrow<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message || 'Invalid request payload');
  }
  return parsed.data;
}

function parseImportQuery(req: Request) {
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || req.query.limit || 20);
  const status = req.query.status ? String(req.query.status) : undefined;
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : undefined;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : undefined;
  const sortBy = req.query.sortBy ? String(req.query.sortBy) : 'createdAt';
  const sortDir = req.query.sortDir ? String(req.query.sortDir) : 'desc';

  return {
    page,
    pageSize,
    status,
    dateFrom: dateFrom && !Number.isNaN(dateFrom.getTime()) ? dateFrom : undefined,
    dateTo: dateTo && !Number.isNaN(dateTo.getTime()) ? dateTo : undefined,
    sortBy: ['createdAt', 'status', 'fileName', 'totalRecords'].includes(sortBy)
      ? (sortBy as 'createdAt' | 'status' | 'fileName' | 'totalRecords')
      : 'createdAt',
    sortDir: sortDir === 'asc' ? 'asc' : 'desc' as 'asc' | 'desc',
  };
}

/**
 * GET /api/inventory/imports?limit=50
 * Returns import history.
 */
router.get('/imports', async (req: Request, res: Response) => {
  const query = parseImportQuery(req);
  const result = await InventoryService.getImports(query);
  res.json({ success: true, ...result });
});

/**
 * GET /api/inventory/imports/export
 * Exports all filtered imports as CSV (complete history, no page cap).
 */
router.get('/imports/export', async (req: Request, res: Response) => {
  const query = parseImportQuery(req);
  const items = await InventoryService.getImportsForExport(query);

  const header = ['id', 'fileName', 'status', 'totalRecords', 'successCount', 'failureCount', 'importedBy', 'createdAt', 'completedAt'];
  const rows = items.map((item: {
    id: string;
    fileName: string;
    status: string;
    totalRecords: number;
    successCount: number;
    failureCount: number;
    importedBy: string | null;
    createdAt: Date;
    completedAt: Date | null;
  }) => [
    item.id,
    item.fileName,
    item.status,
    String(item.totalRecords),
    String(item.successCount),
    String(item.failureCount),
    item.importedBy || '',
    item.createdAt.toISOString(),
    item.completedAt ? item.completedAt.toISOString() : '',
  ]);

  const csv = [header, ...rows]
    .map((cols: string[]) => cols.map((value: string) => `"${String(value).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="inventory-import-history.csv"');
  res.send(csv);
});

/**
 * GET /api/inventory/export-csv?scope=edition|tcg|all&editionId=...&tcgId=...
 * Exports inventory in a re-importable full-upsert CSV format.
 */
router.get('/export-csv', async (req: Request, res: Response) => {
  const scopeRaw = String(req.query.scope || 'all').toLowerCase();
  const scope = ['edition', 'tcg', 'all'].includes(scopeRaw)
    ? (scopeRaw as 'edition' | 'tcg' | 'all')
    : 'all';

  const editionId = req.query.editionId ? String(req.query.editionId) : undefined;
  const tcgId = req.query.tcgId ? String(req.query.tcgId) : undefined;

  const rows = await InventoryService.getInventoryForExport({ scope, editionId, tcgId });

  const header = [
    'tcg',
    'editionCode',
    'editionName',
    'cardCode',
    'cardName',
    'cardNumber',
    'rarity',
    'tags',
    'imageUrl',
    'condition',
    'quantity',
    'referencePrice',
    'marginMultiplier',
  ];

  type InventoryExportRow = {
    tcg: string;
    editionCode: string;
    editionName: string;
    cardCode: string;
    cardName: string;
    cardNumber?: string;
    rarity?: string;
    tags?: string;
    imageUrl?: string;
    condition?: string;
    quantity: number;
    referencePrice?: number;
    marginMultiplier?: number;
  };

  const csvRows = rows.map((row: InventoryExportRow) => [
    row.tcg,
    row.editionCode,
    row.editionName,
    row.cardCode,
    row.cardName,
    row.cardNumber,
    row.rarity,
    row.tags,
    row.imageUrl,
    row.condition,
    String(row.quantity),
    String(row.referencePrice),
    String(row.marginMultiplier),
  ]);

  const csv = [header, ...csvRows]
    .map((cols) => cols.map((value: unknown) => `"${String(value).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  const fileName =
    scope === 'edition'
      ? `inventory-edition-${editionId || 'unknown'}.csv`
      : scope === 'tcg'
        ? `inventory-tcg-${tcgId || 'unknown'}.csv`
        : 'inventory-all.csv';

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(csv);
});

/**
 * GET /api/inventory/imports/:importId
 * Returns one import detail.
 */
router.get('/imports/:importId', async (req: Request, res: Response) => {
  const item = await InventoryService.getImportById(req.params.importId);
  if (!item) {
    throw new NotFoundError('Import not found');
  }

  let parsedErrors: Array<{ row: number; message: string }> = [];
  if (item.errors) {
    try {
      parsedErrors = JSON.parse(item.errors);
    } catch {
      parsedErrors = [{ row: 0, message: 'Could not parse stored import errors JSON' }];
    }
  }
  res.json({
    success: true,
    import: {
      ...item,
      parsedErrors
    }
  });
});

/**
 * POST /api/inventory/update-quantity
 * Update a single listing quantity
 */
router.post('/update-quantity', async (req: Request, res: Response) => {
  const { listingId, quantity } = parseBodyOrThrow(updateQuantitySchema, req.body);

  const updated = await ListingService.updateQuantity(listingId, quantity);
  res.json({
    success: true,
    message: `Quantity updated to ${quantity}`,
    listing: updated
  });
});

/**
 * POST /api/inventory/bulk-update
 * Bulk update quantities (e.g., from CSV)
 */
router.post('/bulk-update', async (req: Request, res: Response) => {
  const { updates } = parseBodyOrThrow(bulkUpdateSchema, req.body);

  const results = await ListingService.bulkUpdateQuantities(updates);
  res.json({
    success: true,
    results
  });
});

/**
 * POST /api/inventory/decrease
 * Decrease quantity (for purchases)
 */
router.post('/decrease', async (req: Request, res: Response) => {
  const { listingId, amount } = parseBodyOrThrow(decreaseQuantitySchema, req.body);

  const updated = await ListingService.decreaseQuantity(listingId, amount);
  res.json({
    success: true,
    message: `Quantity decreased by ${amount}`,
    listing: updated
  });
});

/**
 * POST /api/inventory/import-csv
 * Import or update inventory from CSV file.
 *
 * Supported modes:
 * 1) Update existing listing quantities:
 *    headers: listingId,quantity
 *
 * 2) Upsert full catalog + listing:
 *    headers: tcg,editionCode,editionName,cardCode,cardName,cardNumber,rarity,tags,imageUrl,condition,quantity,referencePrice,marginMultiplier
 */
router.post('/import-csv', requireApiKey, upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ValidationError('File is required in form-data key "file"');
  }

  const dryRun = String(req.body?.dryRun || '').toLowerCase() === 'true';
  const result = await InventoryService.importFromBuffer(req.file.buffer, req.file.mimetype, {
    dryRun,
    fileName: req.file.originalname,
    importedBy: req.body?.importedBy || 'admin'
  });

  res.json({
    success: true,
    result
  });
});

/**
 * POST /api/inventory/import-with-mapping
 * Accepts multipart form-data: file + mapping (JSON string) in field `mapping`.
 * mapping should be an object: { tcg: 'MiColumnaTCG', editionCode: 'ColEd', cardCode: 'ColCard', cardName: 'ColName', quantity: 'ColQty', referencePrice: 'ColPrice', ... }
 */
router.post('/import-with-mapping', requireApiKey, upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ValidationError('File is required in form-data key "file"');
  }

  let mapping: { [k: string]: string } | undefined;
  if (req.body?.mapping) {
    try {
      mapping = typeof req.body.mapping === 'string' ? JSON.parse(req.body.mapping) : req.body.mapping;
    } catch (err) {
      throw new ValidationError('Invalid mapping JSON');
    }
  }

  const dryRun = String(req.body?.dryRun || '').toLowerCase() === 'true';

  const result = await InventoryService.importFromBuffer(req.file.buffer, req.file.mimetype, {
    dryRun,
    fileName: req.file.originalname,
    importedBy: req.body?.importedBy || 'admin',
    columnMapping: mapping,
  });

  res.json({ success: true, result });
});

/**
 * POST /api/inventory/import-csv/validate
 * Validates CSV without writing to database.
 */
router.post('/import-csv/validate', requireApiKey, upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ValidationError('File is required in form-data key "file"');
  }

  const result = await InventoryService.importFromBuffer(req.file.buffer, req.file.mimetype, {
    dryRun: true,
    fileName: req.file.originalname,
    importedBy: req.body?.importedBy || 'admin'
  });

  res.json({
    success: true,
    validationOnly: true,
    result
  });
});

/**
 * GET /api/inventory/import-csv/template
 * Returns a CSV template for full upsert imports.
 */
router.get('/import-csv/template', (_req: Request, res: Response) => {
  const template = [
    'tcg,editionCode,editionName,cardCode,cardName,cardNumber,rarity,tags,imageUrl,condition,quantity,referencePrice,marginMultiplier',
    'MAGIC,MH3,Modern Horizons 3,123,Lightning Bolt,123,Common,instant|burn,,NM,10,2.5,1.2'
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="inventory_template.csv"');
  res.send(template);
});

export default router;

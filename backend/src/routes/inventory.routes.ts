// src/routes/inventory.routes.ts
import express, { Request, Response } from 'express';
import { ListingService } from '../services/ListingService.js';
// @ts-ignore - .js extension is required for Node ESM runtime after build.
import { InventoryService } from '../services/InventoryService.js';
import multer from 'multer';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

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
  try {
    const query = parseImportQuery(req);
    const result = await InventoryService.getImports(query);

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/inventory/imports/export
 * Exports all filtered imports as CSV.
 */
router.get('/imports/export', async (req: Request, res: Response) => {
  try {
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
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="inventory-import-history.csv"');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/inventory/imports/:importId
 * Returns one import detail.
 */
router.get('/imports/:importId', async (req: Request, res: Response) => {
  try {
    const item = await InventoryService.getImportById(req.params.importId);
    if (!item) {
      return res.status(404).json({ error: 'Import not found' });
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
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/inventory/update-quantity
 * Update a single listing quantity
 */
router.post('/update-quantity', async (req: Request, res: Response) => {
  try {
    const { listingId, quantity } = req.body;
    
    if (!listingId || quantity === undefined) {
      return res.status(400).json({
        error: 'listingId and quantity are required'
      });
    }

    const updated = await ListingService.updateQuantity(listingId, quantity);
    res.json({
      success: true,
      message: `Quantity updated to ${quantity}`,
      listing: updated
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/inventory/bulk-update
 * Bulk update quantities (e.g., from CSV)
 */
router.post('/bulk-update', async (req: Request, res: Response) => {
  try {
    const { updates } = req.body;
    
    if (!Array.isArray(updates)) {
      return res.status(400).json({
        error: 'updates must be an array of { listingId, quantity }'
      });
    }

    const results = await ListingService.bulkUpdateQuantities(updates);
    res.json({
      success: true,
      results
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/inventory/decrease
 * Decrease quantity (for purchases)
 */
router.post('/decrease', async (req: Request, res: Response) => {
  try {
    const { listingId, amount } = req.body;
    
    if (!listingId || !amount) {
      return res.status(400).json({
        error: 'listingId and amount are required'
      });
    }

    const updated = await ListingService.decreaseQuantity(listingId, amount);
    res.json({
      success: true,
      message: `Quantity decreased by ${amount}`,
      listing: updated
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
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
router.post('/import-csv', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File is required in form-data key "file"' });
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
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/inventory/import-csv/validate
 * Validates CSV without writing to database.
 */
router.post('/import-csv/validate', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File is required in form-data key "file"' });
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
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/inventory/import-csv/template
 * Returns a CSV template for full upsert imports.
 */
router.get('/import-csv/template', (req: Request, res: Response) => {
  const template = [
    'tcg,editionCode,editionName,cardCode,cardName,cardNumber,rarity,tags,imageUrl,condition,quantity,referencePrice,marginMultiplier',
    'MAGIC,MH3,Modern Horizons 3,123,Lightning Bolt,123,Common,instant|burn,,NM,10,2.5,1.2'
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="inventory_template.csv"');
  res.send(template);
});

export default router;

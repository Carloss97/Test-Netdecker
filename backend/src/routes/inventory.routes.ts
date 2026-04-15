// src/routes/inventory.routes.ts
import express, { Request, Response } from 'express';
import { ListingService } from '../services/ListingService.js';
// @ts-ignore - .js extension is required for Node ESM runtime after build.
import { InventoryService } from '../services/InventoryService.js';
import multer from 'multer';
import { z } from 'zod';
import requireApiKey from '../middleware/requireApiKey.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import ExcelJS from 'exceljs';
import axios from 'axios';

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

const rollbackSchema = z.object({
  force: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  onlyListingIds: z.array(z.string()).optional(),
  skipListingIds: z.array(z.string()).optional(),
  batchId: z.string().optional(),
  batchIndex: z.number().int().optional(),
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

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="inventory-import-history.csv"');

  const header = ['id', 'fileName', 'status', 'totalRecords', 'successCount', 'failureCount', 'importedBy', 'createdAt', 'completedAt'];
  const quote = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

  // Write header
  res.write(header.map((h) => quote(h)).join(',') + '\r\n');

  try {
    // Prefer streaming exporter to avoid large memory usage
    if (typeof (InventoryService as any).streamImportsForExport === 'function') {
      for await (const item of (InventoryService as any).streamImportsForExport(query)) {
        const row = [
          item.id,
          item.fileName,
          item.status,
          String(item.totalRecords),
          String(item.successCount),
          String(item.failureCount),
          item.importedBy || '',
          item.createdAt ? item.createdAt.toISOString() : '',
          item.completedAt ? item.completedAt.toISOString() : '',
        ];
        res.write(row.map((c) => quote(c)).join(',') + '\r\n');
      }
    } else {
      // Fallback: in older environments, fetch all and stream
      const items = await InventoryService.getImportsForExport(query);
      for (const item of items) {
        const row = [
          item.id,
          item.fileName,
          item.status,
          String(item.totalRecords),
          String(item.successCount),
          String(item.failureCount),
          item.importedBy || '',
          item.createdAt ? item.createdAt.toISOString() : '',
          item.completedAt ? item.completedAt.toISOString() : '',
        ];
        res.write(row.map((c) => quote(c)).join(',') + '\r\n');
      }
    }
  } finally {
    res.end();
  }
});

/**
 * POST /api/inventory/imports/:id/rollback
 * Request body: { force?: boolean }
 * Attempts a best-effort rollback of changes recorded for the given import.
 */
router.post('/imports/:id/rollback', requireApiKey, async (req: Request, res: Response) => {
  const importId = String(req.params.id);
  const body = parseBodyOrThrow(rollbackSchema, req.body);

  const force = Boolean(body.force || false);
  const dryRun = Boolean(body.dryRun || false);
  const onlyListingIds = Array.isArray(body.onlyListingIds) ? body.onlyListingIds.map(String) : undefined;
  const skipListingIds = Array.isArray(body.skipListingIds) ? body.skipListingIds.map(String) : undefined;
  const batchId = body.batchId ? String(body.batchId) : undefined;
  const batchIndex = typeof body.batchIndex !== 'undefined' ? Number(body.batchIndex) : undefined;

  const result = await InventoryService.rollbackImport(importId, { force, dryRun, onlyListingIds, skipListingIds, batchId, batchIndex });
  res.json({ success: true, result });
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
 * GET /api/inventory/export-david-xlsx?scope=edition|tcg|all&editionId=...&tcgId=...
 * Exports inventory in the custom "David" XLSX format used by the mapping scripts.
 */
router.get('/export-david-xlsx', async (req: Request, res: Response) => {
  const scopeRaw = String(req.query.scope || 'all').toLowerCase();
  const scope = ['edition', 'tcg', 'all'].includes(scopeRaw) ? (scopeRaw as 'edition' | 'tcg' | 'all') : 'all';

  const editionId = req.query.editionId ? String(req.query.editionId) : undefined;
  const tcgId = req.query.tcgId ? String(req.query.tcgId) : undefined;

  const rows = await InventoryService.getInventoryForExport({ scope, editionId, tcgId });

  // Helper functions (kept local to route to mirror the mapping script)
  function computeCLP(referencePrice?: number, marginMultiplier?: number) {
    const ref = Number(referencePrice || 0) || 0;
    const margin = Number(marginMultiplier || 1) || 1;
    return ref * 1000 * margin;
  }

  function getSigla(rarityText?: string) {
    const s = String(rarityText || '').toLowerCase();
    const norm = s.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!norm) return '';
    if (norm.includes('platinum') && norm.includes('secret')) return 'PLS';
    if (norm.includes('prismatic secret')) return 'PRSE';
    if (norm.includes('prismatic collector')) return 'PC';
    if (norm.includes('prismatic ultimate')) return 'PU';
    if (norm.includes('ghost gold')) return 'GHG';
    if (norm.includes('ghost')) return 'GH';
    if (norm.includes('gold secret')) return 'GLS';
    if (norm.includes('rare gold') || norm.includes('gold rare')) return 'RAG';
    if (norm.includes('gold') && norm.includes('rare')) return 'GLR';
    if (norm.includes('starlight')) return 'ST';
    if (norm.includes('starfoil')) return 'STF';
    if (norm.includes('pharaoh')) return 'PHS';
    // General behaviour: Collector remains COL (do NOT auto-convert to PC)
    if (norm.includes('collector')) return 'COL';
    if (norm.includes('ultimate')) return 'ULT';
    if (norm.includes('ultra')) return 'UL';
    if (norm.includes('super')) return 'SU';
    if (norm.includes('secret')) return 'SEC';
    if (norm.includes('rare')) return 'RA';
    if (norm.includes('common') || norm.includes('comun')) return 'CO';
    return norm.split(' ').map(w => w[0] ? w[0].toUpperCase() : '').join('').slice(0,3).toUpperCase();
  }

  function stripRarityFromName(rawName?: string, rarityText?: string) {
    if (!rawName) return '';
    const name = String(rawName).trim();
    const keywords = [
      'rare', 'collector', "collector's", 'secret', 'ultra', 'ultimate', 'platinum', 'ghost', 'gold', 'starlight', 'prismatic', 'mosaic'
    ];

    const paren = name.match(/^(.*)\s*\(([^)]+)\)\s*$/);
    if (paren) {
      const inside = paren[2].toLowerCase();
      if (keywords.some(k => inside.includes(k))) return paren[1].trim();
    }

    const dash = name.match(/^(.*)\s+-\s+(.+)$/);
    if (dash) {
      const suffix = dash[2].toLowerCase();
      if (keywords.some(k => suffix.includes(k))) return dash[1].trim();
    }

    if (rarityText) {
      const rnorm = String(rarityText).toLowerCase().trim();
      if (rnorm && name.toLowerCase().endsWith(rnorm)) {
        return name.slice(0, -rnorm.length).replace(/[-\s]+$/,'').trim();
      }
    }

    return name;
  }

  function canonicalRarity(rarityText?: string) {
    const s = String(rarityText || '').toLowerCase();
    if (!s) return '';
    if (s.includes('platinum secret')) return 'Platinum Secret';
    if (s.includes('prismatic secret')) return 'Prismatic Secret';
    if (s.includes('prismatic collector')) return 'Prismatic Collector';
    if (s.includes('prismatic ultimate')) return 'Prismatic Ultimate';
    if (s.includes('ghost gold')) return 'Ghost Gold';
    if (s.includes('ghost')) return 'Ghost';
    if (s.includes('gold secret')) return 'Gold Secret';
    if (s.includes('rare gold') || s.includes('gold rare')) return 'Rare Gold';
    if (s.includes('starfoil') || s.includes('starfoil rare')) return 'Starfoil';
    if (s.includes('starlight')) return 'Starlight';
    if (s.includes('pharaoh')) return 'Pharaoh';
    // Collector stays Collector in the general script
    if (s.includes('collector')) return 'Collector';
    if (s.includes('ultimate')) return 'Ultimate';
    if (s.includes('ultra')) return 'Ultra';
    if (s.includes('super')) return 'Super';
    if (s.includes('secret')) return 'Secret';
    if (s.includes('rare') || s.includes("collector's rare") ) return 'Rare';
    if (s.includes('common') || s.includes('comun')) return 'Common';
    return rarityText || '';
  }

  function rewriteUrlName(name?: string) {
    if (!name) return '';
    return String(name)
      .replace(/[\u005b\u005d().,;:'"“”‘’]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  function transformImageUrl(url?: string) {
    if (!url) return '';
    try {
      return String(url).replace(/_200w\.(jpg|png)(\?.*)?$/i, '_in_1000x1000.$1');
    } catch (e) {
      return url || '';
    }
  }

  function detectType(tags?: string, cardName?: string) {
    const s = (String(tags || '') + ' ' + String(cardName || '')).toLowerCase();
    if (/\b(spell|spell card|spellcard|magia|magic)\b/.test(s)) return 'Spell';
    if (/\b(trap|trampa|trap card|trapcard)\b/.test(s)) return 'Trap';
    if (/\b(xyz)\b/.test(s)) return 'Xyz';
    if (/\b(link)\b/.test(s)) return 'Link';
    if (/\b(normal|normal monster)\b/.test(s)) return 'Normal Monster';
    if (/\b(fusion)\b/.test(s)) return 'Fusion';
    if (/\b(pendulum)\b/.test(s)) return 'Pendulum';
    if (/\b(synchro|syncrho)\b/.test(s)) return 'Synchro';
    if (/\b(ritual)\b/.test(s)) return 'Ritual';
    if (/\b(token)\b/.test(s)) return 'Token';
    if (/\b(skill)\b/.test(s)) return 'Skill Card';
    if (/\b(field)\b/.test(s)) return 'Field Center';
    if (/\b(effect)\b/.test(s)) return 'Effect Monster';
    if (/\b(monster|monstruo)\b/.test(s)) return 'Effect Monster';
    return null;
  }

  const _typeCache = new Map<string, string>();
  async function fetchTypeFromYGO(cardName?: string) {
    if (!cardName) return 'Effect Monster';
    if (_typeCache.has(cardName)) return _typeCache.get(cardName) as string;
    try {
      const res = await axios.get('https://db.ygoprodeck.com/api/v7/cardinfo.php', { params: { name: cardName }, timeout: 10000 });
      if (res && res.data && res.data.data && res.data.data.length) {
        const typeStr = (res.data.data[0].type || '').toLowerCase();
        let mapped = 'Effect Monster';
        if (/spell/i.test(typeStr)) mapped = 'Spell';
        else if (/trap/i.test(typeStr)) mapped = 'Trap';
        else if (/xyz/i.test(typeStr)) mapped = 'Xyz';
        else if (/link/i.test(typeStr)) mapped = 'Link';
        else if (/normal/i.test(typeStr)) mapped = 'Normal Monster';
        else if (/fusion/i.test(typeStr)) mapped = 'Fusion';
        else if (/pendulum/i.test(typeStr)) mapped = 'Pendulum';
        else if (/synchro|syncrho/i.test(typeStr)) mapped = 'Synchro';
        else if (/ritual/i.test(typeStr)) mapped = 'Ritual';
        else if (/token/i.test(typeStr)) mapped = 'Token';
        else if (/skill/i.test(typeStr)) mapped = 'Skill Card';
        else if (/field/i.test(typeStr)) mapped = 'Field Center';
        else if (/effect/i.test(typeStr) || /monster/i.test(typeStr)) mapped = 'Effect Monster';
        _typeCache.set(cardName, mapped);
        return mapped;
      }
    } catch (err) {
      try {
        const res2 = await axios.get('https://db.ygoprodeck.com/api/v7/cardinfo.php', { params: { fname: cardName }, timeout: 10000 });
        if (res2 && res2.data && res2.data.data && res2.data.data.length) {
          const typeStr = (res2.data.data[0].type || '').toLowerCase();
          let mapped = 'Effect Monster';
          if (/spell/i.test(typeStr)) mapped = 'Spell';
          else if (/trap/i.test(typeStr)) mapped = 'Trap';
          else if (/xyz/i.test(typeStr)) mapped = 'Xyz';
          else if (/link/i.test(typeStr)) mapped = 'Link';
          else if (/normal/i.test(typeStr)) mapped = 'Normal Monster';
          else if (/fusion/i.test(typeStr)) mapped = 'Fusion';
          else if (/pendulum/i.test(typeStr)) mapped = 'Pendulum';
          else if (/synchro|syncrho/i.test(typeStr)) mapped = 'Synchro';
          else if (/ritual/i.test(typeStr)) mapped = 'Ritual';
          else if (/token/i.test(typeStr)) mapped = 'Token';
          else if (/skill/i.test(typeStr)) mapped = 'Skill Card';
          else if (/field/i.test(typeStr)) mapped = 'Field Center';
          else if (/effect/i.test(typeStr) || /monster/i.test(typeStr)) mapped = 'Effect Monster';
          _typeCache.set(cardName, mapped);
          return mapped;
        }
      } catch (err2) {
        // ignore
      }
    }
    _typeCache.set(cardName, 'Effect Monster');
    return 'Effect Monster';
  }

  const headers = [
    'Reference',
    'Categories',
    'Name',
    'Image URLs',
    'Weight',
    'Price',
    'URL rewritten',
    'Meta title',
    'Meta keywords',
    'Meta description',
    'Resumen',
    'Caracteristicas',
  ];

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('ECL');
  ws.addRow(headers);

  for (const r of rows) {
    const editionCode = r.editionCode || '';
    const editionName = r.editionName || '';
    const rarity = r.rarity || '';
    const tags = r.tags || '';
    const cardName = r.cardName || '';
    const cardNumber = r.cardNumber || '';
    const imageUrl = r.imageUrl || '';

    let language = 'EN';
    const m = String(cardNumber).match(/-([A-Z]{2,3})/i);
    if (m) language = m[1].toUpperCase();

    const clp = computeCLP(r.referencePrice, r.marginMultiplier);
    const cleanedName = stripRarityFromName(cardName, rarity);
    const sigla = getSigla(rarity);

    let tipo = detectType(tags, cleanedName);
    if (!tipo) {
      // fetch remote fallback
      // eslint-disable-next-line no-await-in-loop
      tipo = await fetchTypeFromYGO(cleanedName);
    }

    const rareCanon = canonicalRarity(rarity) || '';

    const mappedRow = [
      `${editionCode || editionName}/${sigla || ''}/${language}`,
      `${editionName || editionCode},Singles Ygo`,
      cleanedName,
      transformImageUrl(imageUrl),
      0.002,
      clp,
      rewriteUrlName(cleanedName),
      `${editionName} - ${cleanedName}`,
      `${editionName} - ${cleanedName}`,
      `${editionName} - ${cleanedName}`,
      `${editionName} - ${cleanedName}`,
      `Rareza:${rareCanon},Tipo:${tipo},Idioma:${language}`,
    ];

    ws.addRow(mappedRow);
  }

  const buffer = await workbook.xlsx.writeBuffer();

  const fileName =
    scope === 'edition'
      ? `inventory-edition-${editionId || 'unknown'}-david.xlsx`
      : scope === 'tcg'
        ? `inventory-tcg-${tcgId || 'unknown'}-david.xlsx`
        : 'inventory-all-david.xlsx';

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(Buffer.from(buffer));
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

import prisma from '../utils/db.js';
import { CardCondition, TCGType } from '@prisma/client';
import { PriceService } from './PriceService.js';
import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { DEFAULT_MARGIN_MULTIPLIER } from '../config/pricing.js';

interface CsvRow {
  [key: string]: string;
}

type ImportMode = 'listing-update' | 'full-upsert';

interface ImportOptions {
  dryRun?: boolean;
  fileName?: string;
  importedBy?: string;
}

interface ImportHistoryQuery {
  page?: number;
  pageSize?: number;
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sortBy?: 'createdAt' | 'status' | 'fileName' | 'totalRecords';
  sortDir?: 'asc' | 'desc';
}

interface InventoryExportQuery {
  scope: 'edition' | 'tcg' | 'all';
  editionId?: string;
  tcgId?: string;
}

function buildImportWhere(query: ImportHistoryQuery): {
  status?: string;
  createdAt?: { gte?: Date; lte?: Date };
} {
  const where: {
    status?: string;
    createdAt?: { gte?: Date; lte?: Date };
  } = {};

  if (query.status) {
    where.status = query.status;
  }

  if (query.dateFrom || query.dateTo) {
    where.createdAt = {
      ...(query.dateFrom ? { gte: query.dateFrom } : {}),
      ...(query.dateTo ? { lte: query.dateTo } : {})
    };
  }

  return where;
}

interface ImportResult {
  total: number;
  success: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
  mode: ImportMode;
  dryRun: boolean;
  importId?: string;
}

const VALID_CONDITIONS: CardCondition[] = ['NM', 'LP', 'MP', 'HP', 'DMG'];
const LISTING_HEADERS = ['listingId', 'quantity'];
const UPSERT_REQUIRED_HEADERS = ['tcg', 'editionCode', 'cardCode', 'cardName', 'quantity', 'referencePrice'];
const SUPPORTED_TCGS: TCGType[] = ['MAGIC', 'POKEMON', 'YUGIOH', 'ONE_PIECE', 'DIGIMON', 'WEISS_SCHWARZ'];

function normalizeHeader(header: string): string {
  return header.replace(/^\uFEFF/, '').trim();
}

export function parseCsvRecords(content: string): string[][] {
  const records: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentValue += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentValue.trim());
      currentValue = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i += 1;
      }

      currentRow.push(currentValue.trim());
      if (currentRow.some((cell) => cell.length > 0)) {
        records.push(currentRow);
      }

      currentRow = [];
      currentValue = '';
      continue;
    }

    currentValue += char;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue.trim());
    if (currentRow.some((cell) => cell.length > 0)) {
      records.push(currentRow);
    }
  }

  return records;
}

export function parseCsv(content: string): CsvRow[] {
  const records = parseCsvRecords(content);

  if (records.length < 2) {
    return [];
  }

  const headers = records[0].map((h) => normalizeHeader(h));

  return records.slice(1).map((values) => {
    const row: CsvRow = {};

    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });

    return row;
  });
}

function parseCondition(raw: string): CardCondition {
  const normalized = (raw || 'NM').toUpperCase() as CardCondition;
  return VALID_CONDITIONS.includes(normalized) ? normalized : 'NM';
}

function parseTcg(raw: string): TCGType {
  const normalized = (raw || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (normalized === 'ONEPIECE') {
    return 'ONE_PIECE';
  }
  if (normalized === 'WEISS' || normalized === 'WEISS_SCHWARZ') {
    return 'WEISS_SCHWARZ';
  }

  if (!SUPPORTED_TCGS.includes(normalized as TCGType)) {
    throw new Error(`Invalid TCG value: ${raw}`);
  }

  return normalized as TCGType;
}

function normalizeRarity(raw?: string): string {
  return (raw || 'Unknown').trim() || 'Unknown';
}

const listingUpdateRowSchema = z.object({
  listingId: z.string().trim().min(1, 'Missing listingId'),
  quantity: z.coerce.number().int('Invalid quantity for listing update').min(0, 'Invalid quantity for listing update'),
});

const fullUpsertRowSchema = z.object({
  tcgType: z.string().transform((value, ctx): TCGType => {
    try {
      return parseTcg(value);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: (error as Error).message,
      });
      return z.NEVER;
    }
  }),
  editionCode: z.string().trim().min(1, 'Missing required fields: editionCode, cardCode, cardName'),
  editionName: z.string().trim().optional(),
  cardCode: z.string().trim().min(1, 'Missing required fields: editionCode, cardCode, cardName'),
  cardName: z.string().trim().min(1, 'Missing required fields: editionCode, cardCode, cardName'),
  quantity: z.coerce.number().int('Invalid quantity').min(0, 'Invalid quantity'),
  referencePrice: z.coerce.number().refine((value) => Number.isFinite(value) && value > 0, {
    message: 'Invalid referencePrice',
  }),
  marginMultiplier: z.coerce.number().refine((value) => Number.isFinite(value) && value > 0, {
    message: 'Invalid marginMultiplier',
  }).default(DEFAULT_MARGIN_MULTIPLIER),
  condition: z.string().optional(),
  rarity: z.string().optional(),
  cardNumber: z.string().optional(),
  tags: z.string().optional(),
  imageUrl: z.string().optional(),
});

function formatZodError(error: z.ZodError): string {
  if (!error.issues.length) {
    return 'Invalid CSV row';
  }
  return error.issues[0].message;
}

export function validateListingUpdateRow(row: CsvRow, duplicateListingIds: Set<string>) {
  const parsed = listingUpdateRowSchema.safeParse({
    listingId: row.listingId,
    quantity: row.quantity || 0,
  });

  if (!parsed.success) {
    throw new Error(formatZodError(parsed.error));
  }

  if (duplicateListingIds.has(parsed.data.listingId)) {
    throw new Error(`Duplicate listingId in CSV: ${parsed.data.listingId}`);
  }

  return parsed.data;
}

export function validateFullUpsertRow(row: CsvRow) {
  const parsed = fullUpsertRowSchema.safeParse({
    tcgType: row.tcg,
    editionCode: row.editionCode,
    editionName: row.editionName || undefined,
    cardCode: row.cardCode,
    cardName: row.cardName,
    quantity: row.quantity || 0,
    referencePrice: row.referencePrice || 0,
    marginMultiplier: row.marginMultiplier || DEFAULT_MARGIN_MULTIPLIER,
    condition: row.condition || undefined,
    rarity: row.rarity || undefined,
    cardNumber: row.cardNumber || undefined,
    tags: row.tags || undefined,
    imageUrl: row.imageUrl || undefined,
  });

  if (!parsed.success) {
    throw new Error(formatZodError(parsed.error));
  }

  return {
    tcgType: parsed.data.tcgType,
    editionCode: parsed.data.editionCode,
    editionName: parsed.data.editionName || parsed.data.editionCode,
    cardCode: parsed.data.cardCode,
    cardName: parsed.data.cardName,
    quantity: parsed.data.quantity,
    referencePrice: parsed.data.referencePrice,
    marginMultiplier: parsed.data.marginMultiplier,
    condition: parseCondition(parsed.data.condition || 'NM'),
    rarity: normalizeRarity(parsed.data.rarity),
    cardNumber: parsed.data.cardNumber || null,
    tags: parsed.data.tags || '',
    imageUrl: parsed.data.imageUrl || null,
  };
}

export function detectImportMode(rows: CsvRow[]): ImportMode {
  if (!rows.length) {
    throw new Error('CSV has no data rows');
  }

  const headers = Object.keys(rows[0]);
  const hasListingHeaders = LISTING_HEADERS.every((header) => headers.includes(header));
  if (hasListingHeaders) {
    return 'listing-update';
  }

  const hasUpsertHeaders = UPSERT_REQUIRED_HEADERS.every((header) => headers.includes(header));
  if (hasUpsertHeaders) {
    return 'full-upsert';
  }

  throw new Error(
    `Invalid CSV headers. Expected either [${LISTING_HEADERS.join(', ')}] or required upsert headers [${UPSERT_REQUIRED_HEADERS.join(', ')}].`
  );
}

export function findDuplicateListingIds(rows: CsvRow[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const row of rows) {
    const listingId = row.listingId;
    if (!listingId) {
      continue;
    }

    if (seen.has(listingId)) {
      duplicates.add(listingId);
      continue;
    }

    seen.add(listingId);
  }

  return [...duplicates];
}

function buildFileHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export class InventoryService {
  static async getImports(query: ImportHistoryQuery = {}) {
    const sortBy = query.sortBy || 'createdAt';
    const sortDir = query.sortDir || 'desc';

    const page = Math.max(query.page || 1, 1);
    const pageSize = Math.min(Math.max(query.pageSize || 20, 1), 100);
    const skip = (page - 1) * pageSize;

    const where = buildImportWhere(query);

    const [items, total] = await Promise.all([
      prisma.inventoryImport.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip,
        take: pageSize
      }),
      prisma.inventoryImport.count({ where })
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(Math.ceil(total / pageSize), 1)
    };
  }

  static async getImportsSimple(limit: number = 50) {
    return prisma.inventoryImport.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200)
    });
  }

  static async getImportById(importId: string) {
    return prisma.inventoryImport.findUnique({
      where: { id: importId }
    });
  }

  static async getImportsForExport(query: ImportHistoryQuery = {}) {
    const sortBy = query.sortBy || 'createdAt';
    const sortDir = query.sortDir || 'desc';
    const where = buildImportWhere(query);

    return prisma.inventoryImport.findMany({
      where,
      orderBy: { [sortBy]: sortDir },
    });
  }

  static async getInventoryForExport(query: InventoryExportQuery) {
    const where: {
      status: { in: string[] };
      editionId?: string;
      card?: { tcgId?: string };
    } = {
      status: { in: ['active', 'manual'] },
    };

    if (query.scope === 'edition') {
      if (!query.editionId) {
        throw new Error('editionId is required when scope=edition');
      }
      where.editionId = query.editionId;
    }

    if (query.scope === 'tcg') {
      if (!query.tcgId) {
        throw new Error('tcgId is required when scope=tcg');
      }
      where.card = { tcgId: query.tcgId };
    }

    const listings = await prisma.listing.findMany({
      where,
      include: {
        card: {
          include: {
            tcg: true,
            edition: true,
          },
        },
      },
      orderBy: [
        { card: { tcg: { name: 'asc' } } },
        { card: { edition: { editionCode: 'asc' } } },
        { card: { cardNumber: 'asc' } },
        { card: { cardName: 'asc' } },
      ],
    });

    return listings.map((l) => ({
      tcg: l.card.tcg.name,
      editionCode: l.card.edition.editionCode,
      editionName: l.card.edition.editionName,
      cardCode: l.card.cardCode,
      cardName: l.card.cardName,
      cardNumber: l.card.cardNumber || '',
      rarity: l.rarity || l.card.rarity || 'Unknown',
      tags: l.card.tags || '',
      imageUrl: l.card.imageUrl || '',
      condition: l.condition || 'NM',
      quantity: l.quantity,
      referencePrice: l.referencePrice,
      marginMultiplier: l.marginMultiplier,
    }));
  }

  static async importFromCsv(content: string, options: ImportOptions = {}): Promise<ImportResult> {
    const rows = parseCsv(content);
    const mode = detectImportMode(rows);
    const dryRun = Boolean(options.dryRun);
    const fileHash = buildFileHash(content);

    let importId: string | undefined;

    if (!dryRun) {
      const existing = await prisma.inventoryImport.findUnique({
        where: { fileHash }
      });

      if (existing) {
        throw new Error(`This file was already imported before (importId: ${existing.id})`);
      }

      const createdImport = await prisma.inventoryImport.create({
        data: {
          fileName: options.fileName || `import-${new Date().toISOString()}.csv`,
          fileHash,
          totalRecords: rows.length,
          status: 'processing',
          importedBy: options.importedBy || 'system'
        }
      });

      importId = createdImport.id;
    }

    const result: ImportResult = {
      total: rows.length,
      success: 0,
      failed: 0,
      errors: [],
      mode,
      dryRun,
      importId
    };

    const duplicateListingIds = mode === 'listing-update' ? findDuplicateListingIds(rows) : [];
    const duplicateListingIdsSet = new Set(duplicateListingIds);

    for (let i = 0; i < rows.length; i += 1) {
      const rowNumber = i + 2;
      const row = rows[i];

      try {
        if (mode === 'listing-update') {
          const parsedRow = validateListingUpdateRow(row, duplicateListingIdsSet);

          const existingListing = await prisma.listing.findUnique({
            where: { id: parsedRow.listingId },
            select: { id: true }
          });

          if (!existingListing) {
            throw new Error(`Listing not found: ${parsedRow.listingId}`);
          }

          if (!dryRun) {
            await prisma.listing.update({
              where: { id: parsedRow.listingId },
              data: {
                quantity: parsedRow.quantity,
                // Mark as ever having had stock if quantity > 0
                ...(parsedRow.quantity > 0 ? { everHadStock: true } : {}),
              }
            });
          }

          result.success += 1;
          continue;
        }

        const parsedRow = validateFullUpsertRow(row);
        const tcgType = parsedRow.tcgType;
        const editionCode = parsedRow.editionCode;
        const editionName = parsedRow.editionName;
        const cardCode = parsedRow.cardCode;
        const cardName = parsedRow.cardName;
        const quantity = parsedRow.quantity;
        const referencePrice = parsedRow.referencePrice;
        const marginMultiplier = parsedRow.marginMultiplier;
        const condition = parsedRow.condition;
        const rarity = parsedRow.rarity;

        const tcg = await prisma.tCG.findUnique({ where: { name: tcgType } });
        if (!tcg) {
          throw new Error(`TCG not initialized: ${tcgType}`);
        }

        if (dryRun) {
          result.success += 1;
          continue;
        }

        const edition = await prisma.edition.upsert({
          where: {
            tcgId_editionCode: {
              tcgId: tcg.id,
              editionCode
            }
          },
          update: {
            editionName
          },
          create: {
            tcgId: tcg.id,
            editionCode,
            editionName
          }
        });

        const card = await prisma.card.upsert({
          where: {
            tcgId_editionId_cardCode_rarity: {
              tcgId: tcg.id,
              editionId: edition.id,
              cardCode,
              rarity,
            }
          },
          update: {
            cardName,
            cardNumber: parsedRow.cardNumber,
            rarity,
            tags: parsedRow.tags,
            imageUrl: parsedRow.imageUrl
          },
          create: {
            tcgId: tcg.id,
            editionId: edition.id,
            cardCode,
            cardName,
            cardNumber: parsedRow.cardNumber,
            rarity,
            tags: parsedRow.tags,
            imageUrl: parsedRow.imageUrl
          }
        } as any);

        const pricing = await PriceService.calculateFinalPrice({
          referencePrice,
          marginMultiplier
        });

        await prisma.listing.upsert({
          where: {
            cardId_condition_rarity: {
              cardId: card.id,
              condition,
              rarity,
            }
          },
          update: {
            quantity,
            referencePrice,
            marginMultiplier,
            rarity,
            exchangeRate: pricing.exchangeRate,
            finalPrice: pricing.finalPrice,
            editionId: edition.id,
            currency: 'CLP',
            status: 'active',
            ...(quantity > 0 ? { everHadStock: true } : {}),
          },
          create: {
            cardId: card.id,
            editionId: edition.id,
            condition,
            rarity,
            quantity,
            referencePrice,
            marginMultiplier,
            exchangeRate: pricing.exchangeRate,
            finalPrice: pricing.finalPrice,
            currency: 'CLP',
            status: 'active',
            everHadStock: quantity > 0,
          }
        } as any);

        result.success += 1;
      } catch (error) {
        result.failed += 1;
        result.errors.push({
          row: rowNumber,
          message: (error as Error).message
        });
      }
    }

    if (!dryRun && importId) {
      await prisma.inventoryImport.update({
        where: { id: importId },
        data: {
          successCount: result.success,
          failureCount: result.failed,
          status: result.failed > 0 ? 'completed_with_errors' : 'completed',
          errors: result.errors.length ? JSON.stringify(result.errors) : null,
          completedAt: new Date()
        }
      });
    }

    return result;
  }

  /**
   * Convert an XLSX buffer into a CSV string, then import using importFromCsv.
   * Uses the first worksheet found.
   */
  static async importFromXlsx(buffer: Buffer, options: ImportOptions = {}): Promise<ImportResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('XLSX file has no worksheets');
    }

    const rows: string[][] = [];

    // ExcelJS cell value helper types for clarity
    interface CellFormulaValue { result?: unknown }
    interface CellRichTextValue { richText: Array<{ text: string }> }

    worksheet.eachRow({ includeEmpty: false }, (row: ExcelJS.Row) => {
      const values: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell: ExcelJS.Cell) => {
        const raw = cell.value;
        if (raw === null || raw === undefined) {
          values.push('');
        } else if (typeof raw === 'object' && 'result' in raw) {
          values.push(String((raw as CellFormulaValue).result ?? ''));
        } else if (typeof raw === 'object' && 'richText' in raw) {
          values.push(
            ((raw as CellRichTextValue).richText || [])
              .map((rt) => rt.text)
              .join(''),
          );
        } else {
          values.push(String(raw));
        }
      });
      rows.push(values);
    });

    if (rows.length === 0) {
      throw new Error('XLSX worksheet is empty');
    }

    // Serialize to CSV so we can reuse all existing CSV logic
    const csvContent = rows
      .map((cols) =>
        cols
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(','),
      )
      .join('\n');

    return this.importFromCsv(csvContent, options);
  }

  /**
   * Auto-detect format (CSV or XLSX) from file buffer and import accordingly.
   */
  static async importFromBuffer(
    buffer: Buffer,
    mimeType: string,
    options: ImportOptions = {},
  ): Promise<ImportResult> {
    const isXlsx =
      mimeType.includes('spreadsheetml') ||
      mimeType.includes('excel') ||
      (options.fileName || '').toLowerCase().endsWith('.xlsx');

    if (isXlsx) {
      return this.importFromXlsx(buffer, options);
    }
    return this.importFromCsv(buffer.toString('utf8'), options);
  }
}

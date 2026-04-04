import prisma from '../utils/db.js';
import { CardCondition, TCGType } from '@prisma/client';
import { PriceService } from './PriceService.js';
import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';

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

  if (!['MAGIC', 'POKEMON', 'YUGIOH', 'ONE_PIECE'].includes(normalized)) {
    throw new Error(`Invalid TCG value: ${raw}`);
  }

  return normalized as TCGType;
}

function normalizeRarity(raw?: string): string {
  return (raw || 'Unknown').trim() || 'Unknown';
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

    for (let i = 0; i < rows.length; i += 1) {
      const rowNumber = i + 2;
      const row = rows[i];

      try {
        if (mode === 'listing-update') {
          const quantity = Number(row.quantity || 0);
          if (!row.listingId) {
            throw new Error('Missing listingId');
          }

          if (duplicateListingIds.includes(row.listingId)) {
            throw new Error(`Duplicate listingId in CSV: ${row.listingId}`);
          }

          if (!Number.isInteger(quantity) || quantity < 0) {
            throw new Error('Invalid quantity for listing update');
          }

          const existingListing = await prisma.listing.findUnique({
            where: { id: row.listingId },
            select: { id: true }
          });

          if (!existingListing) {
            throw new Error(`Listing not found: ${row.listingId}`);
          }

          if (!dryRun) {
            await prisma.listing.update({
              where: { id: row.listingId },
              data: { quantity }
            });
          }

          result.success += 1;
          continue;
        }

        const tcgType = parseTcg(row.tcg);
        const editionCode = row.editionCode;
        const editionName = row.editionName || editionCode;
        const cardCode = row.cardCode;
        const cardName = row.cardName;
        const quantity = Number(row.quantity || 0);
        const referencePrice = Number(row.referencePrice || 0);
        const marginMultiplier = Number(row.marginMultiplier || 1.2);
        const condition = parseCondition(row.condition);
        const rarity = normalizeRarity(row.rarity);

        if (!editionCode || !cardCode || !cardName) {
          throw new Error('Missing required fields: editionCode, cardCode, cardName');
        }

        if (!Number.isInteger(quantity) || quantity < 0) {
          throw new Error('Invalid quantity');
        }

        if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
          throw new Error('Invalid referencePrice');
        }

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
            cardNumber: row.cardNumber || null,
            rarity,
            tags: row.tags || '',
            imageUrl: row.imageUrl || null
          },
          create: {
            tcgId: tcg.id,
            editionId: edition.id,
            cardCode,
            cardName,
            cardNumber: row.cardNumber || null,
            rarity,
            tags: row.tags || '',
            imageUrl: row.imageUrl || null
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
            status: 'active'
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
            status: 'active'
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

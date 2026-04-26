import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'net';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import 'express-async-errors';
import inventoryRoutes from './inventory.routes.js';
import { ListingService } from '../services/ListingService.js';
import { InventoryService } from '../services/InventoryService.js';
import { ApplicationError } from '../utils/errors.js';

type JsonResponse = { status: number; body: unknown };

const originalUpdateQuantity = ListingService.updateQuantity;
const originalBulkUpdateQuantities = ListingService.bulkUpdateQuantities;
const originalDecreaseQuantity = ListingService.decreaseQuantity;

const originalGetImports = InventoryService.getImports;
const originalGetImportsForExport = InventoryService.getImportsForExport;
const originalGetInventoryForExport = InventoryService.getInventoryForExport;
const originalGetImportById = InventoryService.getImportById;
const originalImportFromBuffer = InventoryService.importFromBuffer;
const originalRollbackImport = (InventoryService as any).rollbackImport;

function buildErrorHandler() {
  return (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const isAppError = err instanceof ApplicationError;

    function getStatusCodeFromUnknown(e: unknown): number | undefined {
      if (typeof e === 'object' && e !== null) {
        const maybe = e as Record<string, unknown>;
        if (typeof maybe.statusCode === 'number') return maybe.statusCode;
      }
      return undefined;
    }

    function getCodeFromUnknown(e: unknown): string | undefined {
      if (typeof e === 'object' && e !== null) {
        const maybe = e as Record<string, unknown>;
        if (typeof maybe.code === 'string') return maybe.code;
      }
      return undefined;
    }

    const statusCode = getStatusCodeFromUnknown(err) ?? 500;
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    const code = getCodeFromUnknown(err) ?? (statusCode >= 500 ? 'INTERNAL_ERROR' : 'ERROR');

    res.status(statusCode).json({
      success: false,
      error: {
        code,
        message: isAppError ? message : 'Internal Server Error',
        statusCode,
        timestamp: new Date().toISOString(),
      },
    });
  };
}

function makeRequest(app: Express, method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<JsonResponse> {
  return new Promise((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      const port = addr.port as number;
      const url = `http://127.0.0.1:${port}${path}`;
      const data = body !== undefined ? JSON.stringify(body) : undefined;
      const defaultHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': String(Buffer.byteLength(data)) } : {}),
      };

      const req = httpRequest(
        url,
        {
          method,
          headers: {
            ...defaultHeaders,
            ...extraHeaders,
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            server.close();
            const raw = Buffer.concat(chunks).toString('utf8');
            try {
              resolve({ status: res.statusCode || 500, body: JSON.parse(raw) });
            } catch {
              resolve({ status: res.statusCode || 500, body: raw });
            }
          });
        },
      );

      req.on('error', (err: Error) => {
        server.close();
        reject(err);
      });

      if (data) req.write(data);
      req.end();
    });
  });
}

function asErrorEnvelope(b: unknown) {
  return b as unknown as { success: boolean; error: { code: string; statusCode: number; message: string; timestamp?: string } };
}

function asUpdateSuccess(b: unknown) {
  return b as unknown as { success: true; message: string; listing: { id: string; quantity: number } };
}

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/inventory', inventoryRoutes);
  app.use(buildErrorHandler());
  return app;
}

afterEach(() => {
  ListingService.updateQuantity = originalUpdateQuantity;
  ListingService.bulkUpdateQuantities = originalBulkUpdateQuantities;
  ListingService.decreaseQuantity = originalDecreaseQuantity;

  InventoryService.getImports = originalGetImports;
  InventoryService.getImportsForExport = originalGetImportsForExport;
  InventoryService.getInventoryForExport = originalGetInventoryForExport;
  InventoryService.getImportById = originalGetImportById;
  InventoryService.importFromBuffer = originalImportFromBuffer;
  (InventoryService as any).rollbackImport = originalRollbackImport;
});

test('POST /api/inventory/imports/:id/rollback returns 401 when IMPORT_API_KEY set and header missing', async () => {
  process.env.IMPORT_API_KEY = 'test-secret';

  const app = buildApp();
  const { status, body } = await makeRequest(app, 'POST', '/api/inventory/imports/imp-unauth/rollback', {});
  const resp = asErrorEnvelope(body);

  assert.equal(status, 401);
  assert.equal(resp.success, false);
  assert.equal(resp.error.code, 'UNAUTHORIZED');
  assert.equal(resp.error.message, 'Missing or invalid API key');
});

test('POST /api/inventory/imports/:id/rollback forwards batchId and dryRun to InventoryService.rollbackImport', async () => {
  process.env.IMPORT_API_KEY = 'test-secret';

  (InventoryService as any).rollbackImport = (async (id: string, options: any) => {
    assert.equal(id, 'imp-123');
    assert.equal(options.batchId, 'batch-abc');
    assert.equal(options.dryRun, true);
    return { reverted: 2, skipped: 0, preview: [] } as any;
  }) as any;

  const app = buildApp();
  const { status, body } = await makeRequest(app, 'POST', '/api/inventory/imports/imp-123/rollback', { batchId: 'batch-abc', dryRun: true }, { 'x-api-key': 'test-secret' });
  assert.equal(status, 200);
  const resp = body as any;
  assert.equal(resp.success, true);
  assert.equal(resp.result.reverted, 2);
});

test('POST /api/inventory/imports/:id/rollback forwards batchIndex to InventoryService.rollbackImport', async () => {
  process.env.IMPORT_API_KEY = 'test-secret';

  (InventoryService as any).rollbackImport = (async (id: string, options: any) => {
    assert.equal(id, 'imp-456');
    assert.equal(options.batchIndex, 2);
    return { reverted: 1, skipped: 1 } as any;
  }) as any;

  const app = buildApp();
  const { status, body } = await makeRequest(app, 'POST', '/api/inventory/imports/imp-456/rollback', { batchIndex: 2 }, { 'x-api-key': 'test-secret' });
  assert.equal(status, 200);
  const resp = body as any;
  assert.equal(resp.success, true);
  assert.equal(resp.result.reverted, 1);
});

test('POST /api/inventory/update-quantity returns 400 envelope with exact Zod message for missing listingId', async () => {
  ListingService.updateQuantity = (async () => {
    throw new Error('should not reach service');
  }) as typeof ListingService.updateQuantity;

  const app = buildApp();
  const { status, body } = await makeRequest(app, 'POST', '/api/inventory/update-quantity', { quantity: 3 });
  const resp = asErrorEnvelope(body);

  assert.equal(status, 400);
  assert.equal(resp.success, false);
  assert.equal(resp.error.code, 'VALIDATION_ERROR');
  assert.equal(resp.error.message, 'listingId is required');
  assert.equal(resp.error.statusCode, 400);
  assert.ok(resp.error.timestamp);
});

test('POST /api/inventory/update-quantity returns 400 envelope with exact Zod message for non-integer quantity', async () => {
  ListingService.updateQuantity = (async () => {
    throw new Error('should not reach service');
  }) as typeof ListingService.updateQuantity;

  const app = buildApp();
  const { status, body } = await makeRequest(app, 'POST', '/api/inventory/update-quantity', {
    listingId: 'listing-1',
    quantity: 2.5,
  });
  const resp = asErrorEnvelope(body);

  assert.equal(status, 400);
  assert.equal(resp.success, false);
  assert.equal(resp.error.code, 'VALIDATION_ERROR');
  assert.equal(resp.error.message, 'quantity must be an integer');
});

test('POST /api/inventory/bulk-update returns 400 envelope with exact Zod message for empty updates', async () => {
  ListingService.bulkUpdateQuantities = (async () => {
    throw new Error('should not reach service');
  }) as typeof ListingService.bulkUpdateQuantities;

  const app = buildApp();
  const { status, body } = await makeRequest(app, 'POST', '/api/inventory/bulk-update', { updates: [] });
  const resp = asErrorEnvelope(body);

  assert.equal(status, 400);
  assert.equal(resp.success, false);
  assert.equal(resp.error.code, 'VALIDATION_ERROR');
  assert.equal(resp.error.message, 'updates must be a non-empty array of { listingId, quantity }');
});

test('POST /api/inventory/decrease returns 400 envelope with exact Zod message for amount <= 0', async () => {
  ListingService.decreaseQuantity = (async () => {
    throw new Error('should not reach service');
  }) as typeof ListingService.decreaseQuantity;

  const app = buildApp();
  const { status, body } = await makeRequest(app, 'POST', '/api/inventory/decrease', {
    listingId: 'listing-1',
    amount: 0,
  });
  const resp = asErrorEnvelope(body);

  assert.equal(status, 400);
  assert.equal(resp.success, false);
  assert.equal(resp.error.code, 'VALIDATION_ERROR');
  assert.equal(resp.error.message, 'amount must be > 0');
});

test('POST /api/inventory/update-quantity accepts coercible values and returns success envelope', async () => {
  ListingService.updateQuantity = (async (listingId: string, quantity: number) => {
    assert.equal(listingId, 'listing-123');
    assert.equal(quantity, 5);
    return { id: listingId, quantity } as unknown as Awaited<ReturnType<typeof ListingService.updateQuantity>>;
  }) as unknown as typeof ListingService.updateQuantity;

  const app = buildApp();
  const { status, body } = await makeRequest(app, 'POST', '/api/inventory/update-quantity', {
    listingId: 'listing-123',
    quantity: '5',
  });
  const resp = asUpdateSuccess(body);

  assert.equal(status, 200);
  assert.equal(resp.success, true);
  assert.equal(resp.message, 'Quantity updated to 5');
  assert.equal(resp.listing.id, 'listing-123');
  assert.equal(resp.listing.quantity, 5);
});

test('POST /api/inventory/import-csv/validate returns 401 when IMPORT_API_KEY set and header missing', async () => {
  // enable API key requirement
  process.env.IMPORT_API_KEY = 'test-secret';

  const app = buildApp();
  const { status, body } = await makeRequest(app, 'POST', '/api/inventory/import-csv/validate', {});
  const resp = asErrorEnvelope(body);

  assert.equal(status, 401);
  assert.equal(resp.success, false);
  assert.equal(resp.error.code, 'UNAUTHORIZED');
  assert.equal(resp.error.message, 'Missing or invalid API key');
  assert.equal(resp.error.statusCode, 401);
});

test('POST /api/inventory/import-csv/validate proceeds when x-api-key provided and returns validation error for missing file', async () => {
  process.env.IMPORT_API_KEY = 'test-secret';

  const app = buildApp();
  const { status, body } = await makeRequest(app, 'POST', '/api/inventory/import-csv/validate', {}, { 'x-api-key': 'test-secret' });
  const resp = asErrorEnvelope(body);

  // This will still be 400 because multer did not receive a multipart file in this test harness
  // but the request passed the API key check, so we expect a VALIDATION_ERROR about missing file
  assert.equal(status, 400);
  assert.equal(resp.success, false);
  assert.equal(resp.error.code, 'VALIDATION_ERROR');
  assert.equal(resp.error.message, 'File is required in form-data key "file"');
});

test('POST /api/inventory/import-csv forwards resolved storeId to InventoryService.importFromBuffer', async () => {
  process.env.IMPORT_API_KEY = 'test-secret';

  (InventoryService as any).importFromBuffer = (async (_buffer: Buffer, _mimetype: string, options: any) => {
    assert.equal(options.storeId, 'store-123');
    return { importId: 'imp-store', totalRecords: 1, successCount: 1, failureCount: 0 } as any;
  }) as any;

  const app = buildApp();
  const fd = new FormData();
  fd.append('file', new Blob(['listingId,quantity\nL1,2\n']), 'test.csv');

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as AddressInfo;
  const res = await fetch(`http://127.0.0.1:${addr.port}/api/inventory/import-csv`, {
    method: 'POST',
    body: fd,
    headers: {
      'x-api-key': 'test-secret',
      'x-store-id': 'store-123',
    },
  });
  const json = await res.json();
  server.close();

  assert.equal(res.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.result.importId, 'imp-store');
});

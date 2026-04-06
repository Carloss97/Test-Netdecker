import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { request as httpRequest } from 'node:http';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import 'express-async-errors';
import inventoryRoutes from './inventory.routes.js';
import { ListingService } from '../services/ListingService.js';
import { InventoryService } from '../services/InventoryService.js';
import { ApplicationError } from '../utils/errors.js';

type JsonResponse = { status: number; body: any };

const originalUpdateQuantity = ListingService.updateQuantity;
const originalBulkUpdateQuantities = ListingService.bulkUpdateQuantities;
const originalDecreaseQuantity = ListingService.decreaseQuantity;

const originalGetImports = InventoryService.getImports;
const originalGetImportsForExport = InventoryService.getImportsForExport;
const originalGetInventoryForExport = InventoryService.getInventoryForExport;
const originalGetImportById = InventoryService.getImportById;
const originalImportFromBuffer = InventoryService.importFromBuffer;

function buildErrorHandler() {
  return (err: any, _req: Request, res: Response, _next: NextFunction) => {
    const isAppError = err instanceof ApplicationError;
    const statusCode: number = err.statusCode || 500;
    const message: string = err.message || 'Internal Server Error';
    const code: string = err.code || (statusCode >= 500 ? 'INTERNAL_ERROR' : 'ERROR');

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

function makeRequest(app: Express, method: string, path: string, body?: unknown): Promise<JsonResponse> {
  return new Promise((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as any).port as number;
      const url = `http://127.0.0.1:${port}${path}`;
      const data = body !== undefined ? JSON.stringify(body) : undefined;

      const req = httpRequest(
        url,
        {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(data ? { 'Content-Length': String(Buffer.byteLength(data)) } : {}),
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
});

test('POST /api/inventory/update-quantity returns 400 envelope with exact Zod message for missing listingId', async () => {
  ListingService.updateQuantity = (async () => {
    throw new Error('should not reach service');
  }) as typeof ListingService.updateQuantity;

  const app = buildApp();
  const { status, body } = await makeRequest(app, 'POST', '/api/inventory/update-quantity', { quantity: 3 });

  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'VALIDATION_ERROR');
  assert.equal(body.error.message, 'listingId is required');
  assert.equal(body.error.statusCode, 400);
  assert.ok(body.error.timestamp);
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

  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'VALIDATION_ERROR');
  assert.equal(body.error.message, 'quantity must be an integer');
});

test('POST /api/inventory/bulk-update returns 400 envelope with exact Zod message for empty updates', async () => {
  ListingService.bulkUpdateQuantities = (async () => {
    throw new Error('should not reach service');
  }) as typeof ListingService.bulkUpdateQuantities;

  const app = buildApp();
  const { status, body } = await makeRequest(app, 'POST', '/api/inventory/bulk-update', { updates: [] });

  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'VALIDATION_ERROR');
  assert.equal(body.error.message, 'updates must be a non-empty array of { listingId, quantity }');
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

  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'VALIDATION_ERROR');
  assert.equal(body.error.message, 'amount must be > 0');
});

test('POST /api/inventory/update-quantity accepts coercible values and returns success envelope', async () => {
  ListingService.updateQuantity = (async (listingId: string, quantity: number) => {
    assert.equal(listingId, 'listing-123');
    assert.equal(quantity, 5);
    return {
      id: listingId,
      quantity,
    } as any;
  }) as typeof ListingService.updateQuantity;

  const app = buildApp();
  const { status, body } = await makeRequest(app, 'POST', '/api/inventory/update-quantity', {
    listingId: 'listing-123',
    quantity: '5',
  });

  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.message, 'Quantity updated to 5');
  assert.equal(body.listing.id, 'listing-123');
  assert.equal(body.listing.quantity, 5);
});

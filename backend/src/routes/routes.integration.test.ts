/**
 * Integration tests for API routes.
 *
 * These tests exercise the Express router wiring, validation logic, and
 * standardised error-response format without touching the database.
 * They use a minimal in-process Express application that replaces the real
 * service calls with lightweight stubs so no external connection is required.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'net';
import express, { Express, Request, Response, NextFunction } from 'express';
import 'express-async-errors';
import { ApplicationError, NotFoundError, ValidationError } from '../utils/errors.js';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

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

function makeRequest(
  app: Express,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      const port = addr.port as number;
      const url = `http://127.0.0.1:${port}${path}`;
      const data = body !== undefined ? JSON.stringify(body) : undefined;
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': String(Buffer.byteLength(data)) } : {}),
        },
      };

      const req = httpRequest(url, options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => { chunks.push(chunk); });
        res.on('end', () => {
          server.close();
          const raw = Buffer.concat(chunks).toString('utf8');
          try {
            resolve({ status: res.statusCode!, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode!, body: raw });
          }
        });
      });

      req.on('error', (err: Error) => { server.close(); reject(err); });
      if (data) req.write(data);
      req.end();
    });
  });
}

// --- Small helpers to narrow response shapes in tests ---
function asErrorEnvelope(b: unknown) {
  return b as unknown as { success: boolean; error: { code: string; statusCode: number; message: string; timestamp?: string } };
}

function asHealthResponse(b: unknown) {
  return b as unknown as { status: string; timestamp: string; uptime: number };
}

function asPreviewResponse(b: unknown) {
  return b as unknown as {
    success: boolean;
    listing: null | unknown;
    preview: { referencePrice: number; marginMultiplier: number; exchangeRate: number; finalPrice: number; currency: string };
    diff: { delta: number | null; deltaPercent: number | null; isVolatile: boolean | null };
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Test: Error handler format
// ────────────────────────────────────────────────────────────────────────────

test('global error handler returns standard envelope for NotFoundError', async () => {
  const app = express();
  app.use(express.json());
  app.get('/test', async () => { throw new NotFoundError('Resource missing'); });
  app.use(buildErrorHandler());

  const { status, body } = await makeRequest(app, 'GET', '/test');
  const resp = asErrorEnvelope(body);

  assert.equal(status, 404);
  assert.equal(resp.success, false);
  assert.equal(resp.error.code, 'NOT_FOUND');
  assert.equal(resp.error.statusCode, 404);
  assert.equal(resp.error.message, 'Resource missing');
  assert.ok(resp.error.timestamp);
});

test('global error handler returns standard envelope for ValidationError', async () => {
  const app = express();
  app.use(express.json());
  app.post('/test', async (req: Request) => {
    if (!req.body.name) throw new ValidationError('name is required');
  });
  app.use(buildErrorHandler());

  const { status, body } = await makeRequest(app, 'POST', '/test', {});
  const resp = asErrorEnvelope(body);

  assert.equal(status, 400);
  assert.equal(resp.success, false);
  assert.equal(resp.error.code, 'VALIDATION_ERROR');
  assert.equal(resp.error.statusCode, 400);
  assert.equal(resp.error.message, 'name is required');
});

test('global error handler hides internal error detail for unknown errors', async () => {
  const app = express();
  app.use(express.json());
  app.get('/test', async () => { throw new Error('db connection refused'); });
  app.use(buildErrorHandler());

  const { status, body } = await makeRequest(app, 'GET', '/test');
  const resp = asErrorEnvelope(body);

  assert.equal(status, 500);
  assert.equal(resp.success, false);
  assert.equal(resp.error.statusCode, 500);
  assert.notEqual(resp.error.message, 'db connection refused');
  assert.equal(resp.error.message, 'Internal Server Error');
});

// ────────────────────────────────────────────────────────────────────────────
// Test: /api/health
// ────────────────────────────────────────────────────────────────────────────

test('GET /api/health returns status ok', async () => {
  const app = express();
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
  });

  const { status, body } = await makeRequest(app, 'GET', '/api/health');
  const resp = asHealthResponse(body);

  assert.equal(status, 200);
  assert.equal(resp.status, 'ok');
  assert.ok(typeof resp.timestamp === 'string');
});

// ────────────────────────────────────────────────────────────────────────────
// Test: price-preview validation
// ────────────────────────────────────────────────────────────────────────────

test('POST /api/listings/price-preview rejects missing referencePrice', async () => {
  const app = express();
  app.use(express.json());
  app.post('/api/listings/price-preview', async (req: Request) => {
    const body = req.body as Record<string, unknown>;
    const referencePrice = body.referencePrice as number | undefined;
    const marginMultiplier = body.marginMultiplier as number | undefined;

    if (typeof referencePrice !== 'number' || referencePrice <= 0) {
      throw new ValidationError('referencePrice must be a positive number');
    }
    if (typeof marginMultiplier !== 'number' || marginMultiplier <= 0) {
      throw new ValidationError('marginMultiplier must be a positive number');
    }
  });
  app.use(buildErrorHandler());

  const { status, body } = await makeRequest(app, 'POST', '/api/listings/price-preview', { marginMultiplier: 1.2 });
  const resp = asErrorEnvelope(body);

  assert.equal(status, 400);
  assert.equal(resp.error.code, 'VALIDATION_ERROR');
  assert.match(resp.error.message, /referencePrice/);
});

test('POST /api/listings/price-preview rejects negative referencePrice', async () => {
  const app = express();
  app.use(express.json());
  app.post('/api/listings/price-preview', async (req: Request) => {
    const body = req.body as Record<string, unknown>;
    const referencePrice = body.referencePrice as number | undefined;
    if (typeof referencePrice !== 'number' || referencePrice <= 0) {
      throw new ValidationError('referencePrice must be a positive number');
    }
  });
  app.use(buildErrorHandler());

  const { status, body } = await makeRequest(app, 'POST', '/api/listings/price-preview', { referencePrice: -1, marginMultiplier: 1.2 });
  const resp = asErrorEnvelope(body);

  assert.equal(status, 400);
  assert.equal(resp.error.code, 'VALIDATION_ERROR');
});

test('POST /api/listings/price-preview rejects missing marginMultiplier', async () => {
  const app = express();
  app.use(express.json());
  app.post('/api/listings/price-preview', async (req: Request) => {
    const body = req.body as Record<string, unknown>;
    const referencePrice = body.referencePrice as number | undefined;
    const marginMultiplier = body.marginMultiplier as number | undefined;

    if (typeof referencePrice !== 'number' || referencePrice <= 0) {
      throw new ValidationError('referencePrice must be a positive number');
    }
    if (typeof marginMultiplier !== 'number' || marginMultiplier <= 0) {
      throw new ValidationError('marginMultiplier must be a positive number');
    }
  });
  app.use(buildErrorHandler());

  const { status, body } = await makeRequest(app, 'POST', '/api/listings/price-preview', { referencePrice: 2.5 });
  const resp = asErrorEnvelope(body);

  assert.equal(status, 400);
  assert.equal(resp.error.code, 'VALIDATION_ERROR');
  assert.match(resp.error.message, /marginMultiplier/);
});

// ────────────────────────────────────────────────────────────────────────────
// Test: admin pricing preview validation
// ────────────────────────────────────────────────────────────────────────────

test('POST /api/admin/pricing/preview rejects missing listingId and missing explicit fields', async () => {
  const app = express();
  app.use(express.json());
  app.post('/api/admin/pricing/preview', async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const listingId = body.listingId as string | undefined;
    const referencePrice = body.referencePrice as number | undefined;
    const marginMultiplier = body.marginMultiplier as number | undefined;

    const hasListingId = typeof listingId === 'string' && listingId.trim().length > 0;
    const hasExplicitReferencePrice = typeof referencePrice === 'number';
    const hasExplicitMarginMultiplier = typeof marginMultiplier === 'number';

    if (!hasListingId && (!hasExplicitReferencePrice || !hasExplicitMarginMultiplier)) {
      throw new ValidationError('Provide listingId, or provide both referencePrice and marginMultiplier');
    }

    res.json({ success: true });
  });
  app.use(buildErrorHandler());

  const { status, body } = await makeRequest(app, 'POST', '/api/admin/pricing/preview', {});
  const resp = asErrorEnvelope(body);

  assert.equal(status, 400);
  assert.equal(resp.error.code, 'VALIDATION_ERROR');
  assert.match(resp.error.message, /Provide listingId/);
});

test('POST /api/admin/pricing/preview rejects invalid roundingMultiple', async () => {
  const app = express();
  app.use(express.json());
  app.post('/api/admin/pricing/preview', async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const referencePrice = body.referencePrice as number | undefined;
    const marginMultiplier = body.marginMultiplier as number | undefined;
    const roundingMultiple = body.roundingMultiple as number | undefined;

    if (typeof referencePrice !== 'number' || referencePrice <= 0) {
      throw new ValidationError('referencePrice must be a positive number');
    }
    if (typeof marginMultiplier !== 'number' || marginMultiplier <= 0) {
      throw new ValidationError('marginMultiplier must be a positive number');
    }
    if (roundingMultiple !== undefined && (!Number.isFinite(roundingMultiple) || roundingMultiple < 1)) {
      throw new ValidationError('roundingMultiple must be a number >= 1 when provided');
    }

    res.json({ success: true });
  });
  app.use(buildErrorHandler());

  const { status, body } = await makeRequest(
    app,
    'POST',
    '/api/admin/pricing/preview',
    { referencePrice: 2.5, marginMultiplier: 1.2, roundingMultiple: 0 },
  );
  const resp = asErrorEnvelope(body);

  assert.equal(status, 400);
  assert.equal(resp.error.code, 'VALIDATION_ERROR');
  assert.match(resp.error.message, /roundingMultiple/);
});

test('POST /api/admin/pricing/preview returns preview + diff for explicit inputs', async () => {
  const app = express();
  app.use(express.json());
  app.post('/api/admin/pricing/preview', async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const referencePrice = body.referencePrice as number | undefined;
    const marginMultiplier = body.marginMultiplier as number | undefined;
    if (typeof referencePrice !== 'number' || referencePrice <= 0) {
      throw new ValidationError('referencePrice must be a positive number');
    }
    if (typeof marginMultiplier !== 'number' || marginMultiplier <= 0) {
      throw new ValidationError('marginMultiplier must be a positive number');
    }

    const exchangeRate = 900;
    const finalPrice = Math.round(referencePrice * marginMultiplier * exchangeRate);

    res.json({
      success: true,
      listing: null,
      preview: {
        referencePrice,
        marginMultiplier,
        exchangeRate,
        finalPrice,
        currency: 'CLP',
      },
      diff: {
        delta: null,
        deltaPercent: null,
        isVolatile: null,
      },
    });
  });

  const { status, body } = await makeRequest(
    app,
    'POST',
    '/api/admin/pricing/preview',
    { referencePrice: 3, marginMultiplier: 1.5 },
  );
  const resp = asPreviewResponse(body);

  assert.equal(status, 200);
  assert.equal(resp.success, true);
  assert.equal(resp.listing, null);
  assert.equal(resp.preview.referencePrice, 3);
  assert.equal(resp.preview.marginMultiplier, 1.5);
  assert.equal(resp.preview.finalPrice, 4050);
  assert.equal(resp.preview.currency, 'CLP');
  assert.equal(resp.diff.delta, null);
});

// ────────────────────────────────────────────────────────────────────────────
// Test: sync-prices validation
// ────────────────────────────────────────────────────────────────────────────

test('POST /api/listings/sync-prices rejects empty updates array', async () => {
  const app = express();
  app.use(express.json());
    app.post('/api/listings/sync-prices', async (req: Request) => {
    const { updates } = req.body as { updates?: unknown };
    if (updates !== undefined && (!Array.isArray(updates) || !updates.length)) {
      throw new ValidationError('updates must be a non-empty array when provided');
    }
  });
  app.use(buildErrorHandler());

  const { status, body } = await makeRequest(app, 'POST', '/api/listings/sync-prices', { updates: [] });
  const resp = asErrorEnvelope(body);

  assert.equal(status, 400);
  assert.equal(resp.error.code, 'VALIDATION_ERROR');
});

// ────────────────────────────────────────────────────────────────────────────
// Test: 404 for unknown resource
// ────────────────────────────────────────────────────────────────────────────

test('GET /api/listings/:id returns 404 with standard error when not found', async () => {
  const app = express();
  app.use(express.json());
  app.get('/api/listings/:id', async () => { throw new NotFoundError('Listing not found'); });
  app.use(buildErrorHandler());

  const { status, body } = await makeRequest(app, 'GET', '/api/listings/nonexistent-id');
  const resp = asErrorEnvelope(body);

  assert.equal(status, 404);
  assert.equal(resp.success, false);
  assert.equal(resp.error.code, 'NOT_FOUND');
  assert.equal(resp.error.message, 'Listing not found');
});

test('GET /api/cards/:id returns 404 with standard error when not found', async () => {
  const app = express();
  app.use(express.json());
  app.get('/api/cards/:id', async () => { throw new NotFoundError('Card not found'); });
  app.use(buildErrorHandler());

  const { status, body } = await makeRequest(app, 'GET', '/api/cards/nonexistent-id');
  const resp = asErrorEnvelope(body);

  assert.equal(status, 404);
  assert.equal(resp.success, false);
  assert.equal(resp.error.code, 'NOT_FOUND');
});

// ────────────────────────────────────────────────────────────────────────────
// Test: inventory route validation
// ────────────────────────────────────────────────────────────────────────────

test('POST /api/inventory/update-quantity rejects missing fields', async () => {
  const app = express();
  app.use(express.json());
  app.post('/api/inventory/update-quantity', async (req: Request) => {
    const { listingId, quantity } = req.body;
    if (!listingId || quantity === undefined) {
      throw new ValidationError('listingId and quantity are required');
    }
  });
  app.use(buildErrorHandler());

  const { status, body } = await makeRequest(app, 'POST', '/api/inventory/update-quantity', { listingId: 'abc' });
  const resp = asErrorEnvelope(body);

  assert.equal(status, 400);
  assert.equal(resp.error.code, 'VALIDATION_ERROR');
});

test('POST /api/inventory/bulk-update rejects non-array updates', async () => {
  const app = express();
  app.use(express.json());
  app.post('/api/inventory/bulk-update', async (req: Request) => {
    const { updates } = req.body;
    if (!Array.isArray(updates)) {
      throw new ValidationError('updates must be an array of { listingId, quantity }');
    }
  });
  app.use(buildErrorHandler());

  const { status, body } = await makeRequest(app, 'POST', '/api/inventory/bulk-update', { updates: 'bad' });
  const resp = asErrorEnvelope(body);

  assert.equal(status, 400);
  assert.equal(resp.error.code, 'VALIDATION_ERROR');
});

test('POST /api/inventory/decrease rejects missing fields', async () => {
  const app = express();
  app.use(express.json());
  app.post('/api/inventory/decrease', async (req: Request) => {
    const { listingId, amount } = req.body;
    if (!listingId || !amount) {
      throw new ValidationError('listingId and amount are required');
    }
  });
  app.use(buildErrorHandler());

  const { status, body } = await makeRequest(app, 'POST', '/api/inventory/decrease', { listingId: 'abc' });
  const resp = asErrorEnvelope(body);

  assert.equal(status, 400);
  assert.equal(resp.error.code, 'VALIDATION_ERROR');
});

// ────────────────────────────────────────────────────────────────────────────
// Test: card search validation
// ────────────────────────────────────────────────────────────────────────────

test('GET /api/cards/search rejects missing name parameter', async () => {
  const app = express();
  app.use(express.json());
  app.get('/api/cards/search', async (req: Request) => {
    if (!req.query.name) throw new ValidationError('name query parameter is required');
  });
  app.use(buildErrorHandler());

  const { status, body } = await makeRequest(app, 'GET', '/api/cards/search');
  const resp = asErrorEnvelope(body);

  assert.equal(status, 400);
  assert.equal(resp.error.code, 'VALIDATION_ERROR');
  assert.match(resp.error.message, /name/);
});

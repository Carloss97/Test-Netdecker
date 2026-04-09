import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'net';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import 'express-async-errors';
import inventoryRoutes from './inventory.routes.js';
import publicRoutes from './public.routes.js';
import { ApplicationError } from '../utils/errors.js';

type JsonResponse = { status: number; body: unknown };

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

test('GET /tienda/:slug/catalogo returns HTML and includes slug', async () => {
  const app = express();
  app.use('/tienda', publicRoutes);
  app.use(buildErrorHandler());

  const { status, body } = await makeRequest(app, 'GET', '/tienda/mi-tienda/catalogo');
  assert.equal(status, 200);
  assert.equal(typeof body, 'string');
  const raw = body as string;
  assert.ok(raw.includes('Catálogo de mi-tienda'));
});

test('POST /api/inventory/import-with-mapping returns 401 when IMPORT_API_KEY set and header missing', async () => {
  process.env.IMPORT_API_KEY = 'test-secret';

  const app = express();
  app.use(express.json());
  app.use('/api/inventory', inventoryRoutes);
  app.use(buildErrorHandler());

  const { status, body } = await makeRequest(app, 'POST', '/api/inventory/import-with-mapping', {});
  const resp = asErrorEnvelope(body);

  assert.equal(status, 401);
  assert.equal(resp.success, false);
  assert.equal(resp.error.code, 'UNAUTHORIZED');
  assert.equal(resp.error.message, 'Missing or invalid API key');
});

test('POST /api/inventory/import-with-mapping with x-api-key provided returns 400 (missing file)', async () => {
  process.env.IMPORT_API_KEY = 'test-secret';

  const app = express();
  app.use(express.json());
  app.use('/api/inventory', inventoryRoutes);
  app.use(buildErrorHandler());

  const { status, body } = await makeRequest(app, 'POST', '/api/inventory/import-with-mapping', {}, { 'x-api-key': 'test-secret' });
  const resp = asErrorEnvelope(body);

  assert.equal(status, 400);
  assert.equal(resp.success, false);
  assert.equal(resp.error.code, 'VALIDATION_ERROR');
  assert.equal(resp.error.message, 'File is required in form-data key "file"');
});

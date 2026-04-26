process.env.SKIP_DB_INIT = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import type { AddressInfo } from 'net';
import express, { Express, Request, Response } from 'express';
import 'express-async-errors';

import externalRoutes from './external.routes.js';
import { CardDatabaseService } from '../services/CardDatabaseService.js';
import { ExternalImportService } from '../services/ExternalImportService.js';
import { RateLimitService } from '../services/RateLimitService.js';

function makeRequest(app: Express, method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
  return new Promise<{ status: number; body: unknown; headers: Record<string, string | string[] | undefined> }>((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      const port = addr.port as number;
      const url = `http://127.0.0.1:${port}${path}`;
      const data = body !== undefined ? JSON.stringify(body) : undefined;
      const options = { method, headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': String(Buffer.byteLength(data)) } : {}), ...extraHeaders } };

      const req = httpRequest(url, options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          server.close();
          const raw = Buffer.concat(chunks).toString('utf8');
          try {
            resolve({ status: res.statusCode || 0, body: JSON.parse(raw), headers: res.headers });
          } catch {
            resolve({ status: res.statusCode || 0, body: raw, headers: res.headers });
          }
        });
      });

      req.on('error', (err) => {
        server.close();
        reject(err);
      });

      if (data) req.write(data);
      req.end();
    });
  });
}

function buildErrorHandler() {
  return (err: unknown, _req: Request, res: Response) => {
    const statusCode = typeof (err as any)?.statusCode === 'number' ? (err as any).statusCode : 500;
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    const code = typeof (err as any)?.code === 'string' ? (err as any).code : (statusCode >= 500 ? 'INTERNAL_ERROR' : 'ERROR');

    res.status(statusCode).json({ success: false, error: { code, message, statusCode, timestamp: new Date().toISOString() } });
  };
}

test('POST /api/external/import/set defaults createListing to true', async () => {
  const originalGetSetCards = CardDatabaseService.getSetCards;
  const originalImportSet = ExternalImportService.importSet;
  const originalCheckLimit = RateLimitService.checkLimit;
  try {
    CardDatabaseService.getSetCards = async () => ([
      { externalId: 'c1', source: 'tcgcsv', tcg: 'MAGIC', cardName: 'Card 1', editionCode: 'SET1', editionName: 'Set 1' },
    ] as any);

    RateLimitService.checkLimit = (async () => ({ allowed: true, remaining: 99, resetAt: new Date(Date.now() + 60000), source: 'redis' })) as typeof RateLimitService.checkLimit;

    let receivedOptions: any = null;
    ExternalImportService.importSet = (async (_tcg: any, _setCode: string, options: any) => {
      receivedOptions = options;
      return { total: 1, created: 1, updated: 0, skipped: 0, errors: [], results: [] };
    }) as typeof ExternalImportService.importSet;

    const app = express();
    app.use(express.json());
    app.use('/api/external', externalRoutes);
    app.use(buildErrorHandler());

    const res = await makeRequest(app, 'POST', '/api/external/import/set', { tcg: 'MAGIC', setCode: 'SET1' }, { 'x-store-id': 'store-123' });

    assert.equal(res.status, 200);
    assert.equal((res.body as any).success, true);
    assert.equal(receivedOptions?.createListing, true);
    assert.equal(receivedOptions?.storeId, 'store-123');
    assert.equal(res.headers['x-ratelimit-limit'], '100');
    assert.equal(res.headers['x-ratelimit-remaining'], '99');
  } finally {
    CardDatabaseService.getSetCards = originalGetSetCards;
    ExternalImportService.importSet = originalImportSet;
    RateLimitService.checkLimit = originalCheckLimit;
  }
});

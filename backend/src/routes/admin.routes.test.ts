process.env.SKIP_DB_INIT = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import type { AddressInfo } from 'net';
import express, { Express, Request, Response } from 'express';
import 'express-async-errors';

import adminRoutes from './admin.routes.js';
import prisma from '../utils/db.js';
import { ExchangeRateService } from '../services/ExchangeRateService.js';
import { isImportSetSyncPricesDefault, setImportSetSyncPricesDefault } from '../config/appConfig.js';

function makeRequest(app: Express, method: string, path: string, body?: unknown) {
  return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      const port = addr.port as number;
      const url = `http://127.0.0.1:${port}${path}`;
      const data = body !== undefined ? JSON.stringify(body) : undefined;
      const options = { method, headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': String(Buffer.byteLength(data)) } : {}) } };

      const req = httpRequest(url, options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          server.close();
          const raw = Buffer.concat(chunks).toString('utf8');
          try {
            resolve({ status: res.statusCode || 0, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode || 0, body: raw });
          }
        });
      });

      req.on('error', (err) => { server.close(); reject(err); });
      if (data) req.write(data);
      req.end();
    });
  });
}

function buildErrorHandler() {
  return (err: unknown, _req: Request, res: Response) => {
    const isAppError = false;
    const statusCode = typeof (err as any)?.statusCode === 'number' ? (err as any).statusCode : 500;
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    const code = typeof (err as any)?.code === 'string' ? (err as any).code : (statusCode >= 500 ? 'INTERNAL_ERROR' : 'ERROR');

    res.status(statusCode).json({ success: false, error: { code, message: isAppError ? message : 'Internal Server Error', statusCode, timestamp: new Date().toISOString() } });
  };
}

test('GET /api/admin/pricing-config returns importSetSyncPricesDefault and POST updates it', async () => {
  // Initialize runtime default
  setImportSetSyncPricesDefault(true);
  assert.equal(isImportSetSyncPricesDefault(), true);

  // Stub prisma listing aggregate to avoid DB access
  const origAggregate = (prisma.listing as any).aggregate;
  (prisma.listing as any).aggregate = async () => ({ _avg: { marginMultiplier: 1.0 }, _count: { _all: 10 } });

  // Stub exchange rate fast lookup to avoid cache/redis/db calls
  const origFast = ExchangeRateService.getUSDtoCLPRateMetaFast;
  ExchangeRateService.getUSDtoCLPRateMetaFast = async () => ({ rate: 900, retrievalSource: 'database', provider: 'manual', fetchedAt: new Date() } as any);
  const origMeta = ExchangeRateService.getUSDtoCLPRateMeta;
  ExchangeRateService.getUSDtoCLPRateMeta = async () => ({ rate: 900, retrievalSource: 'database', provider: 'manual', fetchedAt: new Date() } as any);

  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  app.use(buildErrorHandler());

  // First: GET should reflect the runtime default (true)
  let r = await makeRequest(app, 'GET', '/api/admin/pricing-config');
  assert.equal(r.status, 200);
  assert.equal((r.body as any).success, true);
  assert.equal((r.body as any).config.importSetSyncPricesDefault, true);

  // Now POST to change the runtime default to false
  r = await makeRequest(app, 'POST', '/api/admin/pricing-config', { importSetSyncPricesDefault: false });
  assert.equal(r.status, 200);
  assert.equal((r.body as any).success, true);

  // The runtime value should be updated
  assert.equal(isImportSetSyncPricesDefault(), false);

  // GET should now return the updated value
  r = await makeRequest(app, 'GET', '/api/admin/pricing-config');
  assert.equal(r.status, 200);
  assert.equal((r.body as any).config.importSetSyncPricesDefault, false);

  // Restore stubs
  (prisma.listing as any).aggregate = origAggregate;
  ExchangeRateService.getUSDtoCLPRateMetaFast = origFast;
  ExchangeRateService.getUSDtoCLPRateMeta = origMeta;

  // Reset runtime default
  setImportSetSyncPricesDefault(true);
});

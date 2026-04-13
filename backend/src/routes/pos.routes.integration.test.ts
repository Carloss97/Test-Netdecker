import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'net';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import 'express-async-errors';
import posRoutes from './pos.routes.js';

type JsonResponse = { status: number; body: unknown };

function buildErrorHandler() {
  return (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
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
        message: (err instanceof Error ? message : 'Internal Server Error'),
        statusCode,
        timestamp: new Date().toISOString(),
      }
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

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/pos', posRoutes);
  app.use(buildErrorHandler());
  return app;
}

test('POST /api/pos/sessions -> create and GET session and transactions', async () => {
  const app = buildApp();

  // Create session
  const { status: cStatus, body: cBody } = await makeRequest(app, 'POST', '/api/pos/sessions', { userId: 'u1', items: [{ listingId: 'L1', qty: 2 }], subtotal: 100, tax: 19, total: 119 });
  assert.equal(cStatus, 200);
  const createResp = cBody as any;
  assert.equal(createResp.success, true);
  assert.ok(createResp.session?.sessionId);

  const sessionId = createResp.session.sessionId as string;

  // Retrieve session
  const { status: gStatus, body: gBody } = await makeRequest(app, 'GET', `/api/pos/sessions/${sessionId}`);
  assert.equal(gStatus, 200);
  const getResp = gBody as any;
  assert.equal(getResp.success, true);
  assert.equal(getResp.session.sessionId, sessionId);

  // Create a transaction
  const { status: tStatus, body: tBody } = await makeRequest(app, 'POST', `/api/pos/sessions/${sessionId}/transactions`, { method: 'CARD', amount: 119 });
  assert.equal(tStatus, 200);
  const txResp = tBody as any;
  assert.equal(txResp.success, true);
  assert.equal(Number(txResp.transaction.amount), 119);

  // List transactions
  const { status: lStatus, body: lBody } = await makeRequest(app, 'GET', `/api/pos/sessions/${sessionId}/transactions`);
  assert.equal(lStatus, 200);
  const listResp = lBody as any;
  assert.equal(listResp.success, true);
  assert.ok(Array.isArray(listResp.transactions));
  assert.ok(listResp.transactions.length >= 1);
});

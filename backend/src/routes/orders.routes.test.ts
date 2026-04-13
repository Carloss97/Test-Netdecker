import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'net';
import express, { Express, Request, Response } from 'express';
import 'express-async-errors';

import ordersRoutes from './orders.routes.js';
import OrderService from '../services/OrderService.js';
import { ApplicationError } from '../utils/errors.js';

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
    const isAppError = err instanceof ApplicationError;
    const statusCode = typeof (err as any)?.statusCode === 'number' ? (err as any).statusCode : 500;
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    const code = typeof (err as any)?.code === 'string' ? (err as any).code : (statusCode >= 500 ? 'INTERNAL_ERROR' : 'ERROR');

    res.status(statusCode).json({ success: false, error: { code, message: isAppError ? message : 'Internal Server Error', statusCode, timestamp: new Date().toISOString() } });
  };
}

test('GET /api/orders returns list via OrderService stub', async () => {
  const orig = OrderService.listOrders;
  OrderService.listOrders = async () => ({ orders: [{ id: 'ord1', orderNumber: 'ORD-1', status: 'PENDING', subtotal: 100, total: 100, items: [] }], total: 1 } as any);

  const app = express();
  app.use(express.json());
  app.use('/api/orders', ordersRoutes);
  app.use(buildErrorHandler());

  const { status, body } = await makeRequest(app, 'GET', '/api/orders');
  assert.equal(status, 200);
  assert.equal((body as any).success, true);
  assert.equal((body as any).total, 1);

  OrderService.listOrders = orig;
});

test('POST /api/orders/:id/cancel calls OrderService.cancelOrder', async () => {
  const orig = OrderService.cancelOrder;
  let called: any = null;
  OrderService.cancelOrder = async (id: string, performedBy?: string | null) => {
    called = { id, performedBy };
    return { id, status: 'CANCELLED', items: [], subtotal: 0, total: 0 } as any;
  };

  const app = express();
  app.use(express.json());
  app.use('/api/orders', ordersRoutes);
  app.use(buildErrorHandler());

  const { status, body } = await makeRequest(app, 'POST', '/api/orders/ord1/cancel', { performedBy: 'admin' });
  assert.equal(status, 200);
  assert.equal((body as any).success, true);
  assert.ok(called);
  assert.equal(called.id, 'ord1');
  assert.equal(called.performedBy, 'admin');

  OrderService.cancelOrder = orig;
});

test('POST /api/orders/:id/ship calls OrderService.shipOrder', async () => {
  const orig = OrderService.shipOrder;
  let called: any = null;
  OrderService.shipOrder = async (id: string) => {
    called = { id };
    return { id, status: 'SHIPPED' } as any;
  };

  const app = express();
  app.use(express.json());
  app.use('/api/orders', ordersRoutes);
  app.use(buildErrorHandler());

  const { status, body } = await makeRequest(app, 'POST', '/api/orders/ord1/ship');
  assert.equal(status, 200);
  assert.equal((body as any).success, true);
  assert.ok(called);
  assert.equal(called.id, 'ord1');

  OrderService.shipOrder = orig;
});

test('POST /api/orders/:id/deliver calls OrderService.deliverOrder', async () => {
  const orig = OrderService.deliverOrder;
  let called: any = null;
  OrderService.deliverOrder = async (id: string) => {
    called = { id };
    return { id, status: 'DELIVERED' } as any;
  };

  const app = express();
  app.use(express.json());
  app.use('/api/orders', ordersRoutes);
  app.use(buildErrorHandler());

  const { status, body } = await makeRequest(app, 'POST', '/api/orders/ord1/deliver');
  assert.equal(status, 200);
  assert.equal((body as any).success, true);
  assert.ok(called);
  assert.equal(called.id, 'ord1');

  OrderService.deliverOrder = orig;
});

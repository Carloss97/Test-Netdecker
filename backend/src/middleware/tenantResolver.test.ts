import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'net';
import express, { type Express, type Request, type Response } from 'express';
import 'express-async-errors';

import prisma from '../utils/db.js';
import tenantResolver from './tenantResolver.js';
import requireTenant from './requireTenant.js';

function makeRequest(app: Express, method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<{ status: number; body: unknown }> {
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

test('tenantResolver resolves store by slug param', async () => {
  const slug = `test-slug-${Date.now()}`;
  const store = await prisma.store.create({ data: { slug, name: 'Test Store Slug', apiKeyHash: 's3cret' } });

  const app = express();
  app.get('/:slug/ping', tenantResolver, (req: Request, res: Response) => {
    res.json({ store: (req as any).store ?? null });
  });

  try {
    const { status, body } = await makeRequest(app, 'GET', `/${slug}/ping`);
    assert.equal(status, 200);
    const b = body as any;
    assert.ok(b.store, 'store should be present');
    assert.equal(b.store.slug, slug);
  } finally {
    await prisma.store.delete({ where: { id: store.id } });
  }
});

test('tenantResolver resolves store by x-api-key header', async () => {
  const slug = `test-key-${Date.now()}`;
  const apiKey = `ak-${Date.now()}`;
  const store = await prisma.store.create({ data: { slug, name: 'Test Store Key', apiKeyHash: apiKey } });

  const app = express();
  app.get('/ping', tenantResolver, (req: Request, res: Response) => {
    res.json({ store: (req as any).store ?? null });
  });

  try {
    const { status, body } = await makeRequest(app, 'GET', '/ping', undefined, { 'x-api-key': apiKey });
    assert.equal(status, 200);
    const b = body as any;
    assert.ok(b.store, 'store should be present');
    assert.equal(b.store.slug, slug);
  } finally {
    await prisma.store.delete({ where: { id: store.id } });
  }
});

test('requireTenant blocks when no tenant resolved', async () => {
  const app = express();
  app.get('/secure', tenantResolver, requireTenant, (req: Request, res: Response) => {
    res.json({ ok: true });
  });

  const { status, body } = await makeRequest(app, 'GET', '/secure');
  // Expect our standard error envelope (Unauthorized)
  assert.equal(status, 401);
  const b = body as any;
  assert.equal(b.success, false);
  assert.equal(b.error.code, 'UNAUTHORIZED');
});

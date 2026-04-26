process.env.SKIP_DB_INIT = 'true';
process.env.SKIP_RATE_LIMIT = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import type { AddressInfo } from 'net';
import express, { Express, Request, Response, NextFunction } from 'express';
import 'express-async-errors';

import adminAuthRoutes from './admin.auth.routes.js';
import AdminAuthService from '../services/AdminAuthService.js';
import prisma from '../utils/db.js';

function makeRequest(
  app: Express,
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>
) {
  return new Promise<{ status: number; body: unknown; headers: Record<string, string | string[] | undefined> }>((resolve, reject) => {
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
          ...(extraHeaders || {}),
        },
      };

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
  return (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const statusCode = typeof (err as any)?.statusCode === 'number' ? (err as any).statusCode : 500;
    const code = typeof (err as any)?.code === 'string' ? (err as any).code : (statusCode >= 500 ? 'INTERNAL_ERROR' : 'ERROR');
    res.status(statusCode).json({
      success: false,
      error: {
        code,
        message: statusCode >= 500 ? 'Internal Server Error' : String((err as any)?.message || 'Error'),
        statusCode,
      },
    });
  };
}

test('admin auth login success sets token cookies and returns payload', async () => {
  const originalAuthenticate = AdminAuthService.authenticate;
  try {
    AdminAuthService.authenticate = (async () => ({
      token: 'tok_1',
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      user: { id: 'u1', email: 'admin@test.com', role: 'ADMIN' },
    })) as typeof AdminAuthService.authenticate;

    const app = express();
    app.use(express.json());
    app.use('/api/admin/auth', adminAuthRoutes);
    app.use(buildErrorHandler());

    const res = await makeRequest(app, 'POST', '/api/admin/auth/login', {
      email: 'admin@test.com',
      password: 'secret',
    });

    assert.equal(res.status, 200);
    assert.equal((res.body as any).success, true);
    const setCookie = res.headers['set-cookie'];
    const cookieLines = Array.isArray(setCookie) ? setCookie : [String(setCookie || '')];
    assert.equal(cookieLines.some((line) => line.includes('auth_token=')), true);
    assert.equal(cookieLines.some((line) => line.includes('auth_token_js=')), true);
  } finally {
    AdminAuthService.authenticate = originalAuthenticate;
  }
});

test('admin auth login returns 400 when required fields are missing', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/auth', adminAuthRoutes);
  app.use(buildErrorHandler());

  const res = await makeRequest(app, 'POST', '/api/admin/auth/login', {
    email: 'admin@test.com',
  });

  assert.equal(res.status, 400);
  assert.equal((res.body as any).success, false);
});

test('admin auth me returns 401 without token', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/auth', adminAuthRoutes);
  app.use(buildErrorHandler());

  const res = await makeRequest(app, 'GET', '/api/admin/auth/me');

  assert.equal(res.status, 401);
  assert.equal((res.body as any).success, false);
  assert.equal((res.body as any).error.code, 'UNAUTHORIZED');
});

test('admin auth me returns user when token is valid', async () => {
  const originalSessionFind = (prisma.adminSession as any).findUnique;
  try {
    (prisma.adminSession as any).findUnique = async () => ({
      token: 'tok_valid',
      expiresAt: new Date(Date.now() + 60000),
      user: { id: 'u99', email: 'manager@test.com', role: 'MANAGER', isActive: true },
      storeId: 'store-1',
    });

    const app = express();
    app.use(express.json());
    app.use('/api/admin/auth', adminAuthRoutes);
    app.use(buildErrorHandler());

    const res = await makeRequest(app, 'GET', '/api/admin/auth/me', undefined, {
      Authorization: 'Bearer tok_valid',
    });

    assert.equal(res.status, 200);
    assert.equal((res.body as any).success, true);
    assert.equal((res.body as any).data.id, 'u99');
    assert.equal((res.body as any).data.role, 'MANAGER');
  } finally {
    (prisma.adminSession as any).findUnique = originalSessionFind;
  }
});

test('admin auth me returns resolvedStoreId and scopeMode for request-scoped global admin', async () => {
  const originalSessionFind = (prisma.adminSession as any).findUnique;
  const originalStoreFindUnique = prisma.store.findUnique;

  try {
    (prisma.adminSession as any).findUnique = async () => ({
      token: 'tok_valid',
      expiresAt: new Date(Date.now() + 60000),
      user: { id: 'u100', email: 'admin@test.com', role: 'ADMIN', isActive: true },
      storeId: null,
      store: null,
    });

    prisma.store.findUnique = (async (args: any) => {
      if (args?.where?.slug === 'store-uno' || args?.where?.id === 'store-1') {
        return { id: 'store-1', slug: 'store-uno', name: 'Store Uno' } as any;
      }
      return null;
    }) as any;

    const app = express();
    app.use(express.json());
    app.use('/api/admin/auth', adminAuthRoutes);
    app.use(buildErrorHandler());

    const res = await makeRequest(app, 'GET', '/api/admin/auth/me', undefined, {
      Authorization: 'Bearer tok_valid',
      'x-store-id': 'store-uno',
    });

    assert.equal(res.status, 200);
    assert.equal((res.body as any).success, true);
    assert.equal((res.body as any).data.id, 'u100');
    assert.equal((res.body as any).data.storeId, null);
    assert.equal((res.body as any).data.resolvedStoreId, 'store-1');
    assert.equal((res.body as any).data.scopeMode, 'request-store-scoped');
  } finally {
    (prisma.adminSession as any).findUnique = originalSessionFind;
    prisma.store.findUnique = originalStoreFindUnique;
  }
});

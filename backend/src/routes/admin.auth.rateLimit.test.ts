process.env.SKIP_DB_INIT = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import type { AddressInfo } from 'net';
import express, { Express } from 'express';
import 'express-async-errors';

import adminAuthRoutes from './admin.auth.routes.js';
import AdminAuthService from '../services/AdminAuthService.js';
import { RateLimitService } from '../services/RateLimitService.js';

function makeRequest(app: Express, method: string, path: string, body?: unknown) {
  return new Promise<{ status: number; body: unknown; headers: Record<string, string | string[] | undefined> }>((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      const port = addr.port as number;
      const url = `http://127.0.0.1:${port}${path}`;
      const data = body !== undefined ? JSON.stringify(body) : undefined;
      const options = { method, headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': String(Buffer.byteLength(data)) } : {}) } };

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

test('POST /api/admin/auth/login returns rate-limit headers', async () => {
  const originalCheck = RateLimitService.checkLimit;
  const originalAuthenticate = AdminAuthService.authenticate;
  try {
    RateLimitService.checkLimit = (async () => ({ allowed: true, remaining: 4, resetAt: new Date(Date.now() + 60000), source: 'redis' })) as typeof RateLimitService.checkLimit;
    AdminAuthService.authenticate = (async () => ({ token: 'token-1', expiresAt: new Date(Date.now() + 60000).toISOString(), user: { id: 'u1', email: 'admin@test.com', role: 'ADMIN' } })) as typeof AdminAuthService.authenticate;

    const app = express();
    app.use(express.json());
    app.use('/api/admin/auth', adminAuthRoutes);

    const res = await makeRequest(app, 'POST', '/api/admin/auth/login', { email: 'admin@test.com', password: 'secret' });

    assert.equal(res.status, 200);
    assert.equal((res.body as any).success, true);
    assert.equal(res.headers['x-ratelimit-limit'], '5');
    assert.equal(res.headers['x-ratelimit-remaining'], '4');
  } finally {
    RateLimitService.checkLimit = originalCheck;
    AdminAuthService.authenticate = originalAuthenticate;
  }
});

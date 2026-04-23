process.env.SKIP_DB_INIT = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import type { AddressInfo } from 'net';
import express, { Express } from 'express';
import 'express-async-errors';

import cardRoutes from './card.routes.js';
import { RateLimitService } from '../services/RateLimitService.js';
import { CardService } from '../services/CardService.js';

function makeRequest(app: Express, method: string, path: string) {
  return new Promise<{ status: number; body: unknown; headers: Record<string, string | string[] | undefined> }>((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      const port = addr.port as number;
      const url = `http://127.0.0.1:${port}${path}`;

      const req = httpRequest(url, { method }, (res) => {
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

      req.end();
    });
  });
}

test('GET /api/cards/search returns rate-limit headers', async () => {
  const originalCheck = RateLimitService.checkLimit;
  const originalSearch = CardService.searchByName;
  try {
    RateLimitService.checkLimit = (async () => ({ allowed: true, remaining: 99, resetAt: new Date(Date.now() + 60000), source: 'redis' })) as typeof RateLimitService.checkLimit;
    CardService.searchByName = (async () => ([{ id: 'card-1' }])) as typeof CardService.searchByName;

    const app = express();
    app.use('/api/cards', cardRoutes);

    const res = await makeRequest(app, 'GET', '/api/cards/search?name=Black%20Lotus');

    assert.equal(res.status, 200);
    assert.equal(res.headers['x-ratelimit-limit'], '100');
    assert.equal(res.headers['x-ratelimit-remaining'], '99');
  } finally {
    RateLimitService.checkLimit = originalCheck;
    CardService.searchByName = originalSearch;
  }
});

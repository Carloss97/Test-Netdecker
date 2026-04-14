import express from 'express';
import { createServer } from 'node:http';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'net';
import posRoutes from '../src/routes/pos.routes.js';
import prisma from '../src/utils/db.js';

function makeRequest(app: express.Express, method: string, path: string, body?: unknown): Promise<{ status: number; body: unknown }> {
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
          headers: defaultHeaders,
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
        }
      );

      req.on('error', (err) => {
        server.close();
        reject(err);
      });

      if (data) req.write(data);
      req.end();
    });
  });
}

async function run() {
  const app = express();
  app.use(express.json());
  app.use('/api/pos', posRoutes);

  console.log('Prisma keys:', Object.keys(prisma));
  console.log('prisma.pOSSession ===', (prisma as any).pOSSession);

  console.log('POST /api/pos/sessions →');
  const post = await makeRequest(app, 'POST', '/api/pos/sessions', { userId: 'u1', items: [{ listingId: 'L1', qty: 2 }], subtotal: 100, tax: 19, total: 119 });
  console.log('status:', post.status);
  console.log('body:', JSON.stringify(post.body, null, 2));

  if (post.status !== 200) process.exitCode = 1;
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

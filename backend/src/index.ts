// src/index.ts
import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import 'express-async-errors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from backend/.env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Optional: initialize Sentry if DSN present (dynamic import so dependency is optional)
if (process.env.SENTRY_DSN) {
  import('@sentry/node')
    .then((Sentry) => {
      try {
        (Sentry as any).init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV || 'development' });
        console.log('Sentry initialized');
      } catch (e) {
        console.error('Sentry init error', e);
      }
    })
    .catch((err) => {
      console.error('Sentry package not available:', err?.message || err);
    });
}

// Import error utilities
import { ApplicationError } from './utils/errors.js';

// Import routes
import tcgRoutes from './routes/tcg.routes.js';
import cardRoutes from './routes/card.routes.js';
import listingRoutes from './routes/listing.routes.js';
import inventoryRoutes from './routes/inventory.routes.js';
import erpRoutes from './routes/erp.routes.js';
import paymentsRoutes from './routes/payments.routes.js';
import cartRoutes from './routes/cart.routes.js';
import ordersRoutes from './routes/orders.routes.js';
import healthRoutes from './routes/health.routes.js';
import externalRoutes from './routes/external.routes.js';
import adminRoutes from './routes/admin.routes.js';
import adminAuthRoutes from './routes/admin.auth.routes.js';
import editionRoutes from './routes/edition.routes.js';
import publicRoutes from './routes/public.routes.js';
import pricingRoutes from './routes/pricing.routes.js';
import posRoutes from './routes/pos.routes.js';
import invoicesRoutes from './routes/invoices.routes.js';
import { startPriceSyncCron } from './jobs/priceSync.job.js';
import { startCatalogSyncCron } from './jobs/catalogSync.job.js';
import { startCartCleanupCron } from './jobs/cartCleanup.job.js';
import { startInvoiceCleanupJob } from './jobs/invoiceCleanup.job.js';

const app: Express = express();
const PORT = process.env.PORT || 3333;

// ============================================
// MIDDLEWARE
// ============================================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Serve persisted invoice PDFs (if any)
app.use('/invoices/files', express.static(path.resolve(__dirname, '../public/invoices')));

// Optionally mount /metrics route dynamically if prom-client is available
(async () => {
  try {
    const metricsMod = await import('./routes/metrics.routes.js');
    app.use('/metrics', metricsMod.default);
    console.log('Mounted /metrics endpoint');
  } catch (err) {
    // prom-client or metrics route not available; continue without metrics
  }
})();

// ============================================
// ROUTES
// ============================================

app.use('/api/health', healthRoutes);
app.use('/api/tcgs', tcgRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/erp', erpRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/external', externalRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/editions', editionRoutes);
app.use('/tienda', publicRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/invoices', invoicesRoutes);

// ============================================
// ERROR HANDLING
// ============================================

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  function isErrLike(e: unknown): e is { statusCode?: number; message?: string; code?: string } {
    return typeof e === 'object' && e !== null;
  }

  const isAppError = err instanceof ApplicationError;

  let statusCode = 500;
  let message = 'Internal Server Error';
  let code = 'INTERNAL_ERROR';

  if (isAppError) {
    statusCode = err.statusCode;
    message = err.message;
    code = err.code;
  } else if (isErrLike(err)) {
    if (typeof err.statusCode === 'number') statusCode = err.statusCode;
    if (typeof err.message === 'string') message = err.message;
    if (typeof err.code === 'string') code = err.code;
  }

  if (statusCode >= 500) {
    console.error('Error:', err);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: isAppError ? message : 'Internal Server Error',
      statusCode,
      timestamp: new Date().toISOString(),
    }
  });
});

// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found',
      statusCode: 404,
      timestamp: new Date().toISOString(),
    }
  });
});

// ============================================
// SERVER STARTUP
// ============================================
// Server startup is performed from `src/server.ts` to avoid starting the
// HTTP listener when this module is imported by tests or other tools.
export function startServer(portArg?: number | string) {
  const portVal = portArg ?? process.env.PORT ?? 3333;
  const port = typeof portVal === 'string' ? Number(portVal) : portVal;

  const server = app.listen(port, () => {
    startPriceSyncCron();
    startCatalogSyncCron();
    startCartCleanupCron();
    startInvoiceCleanupJob();

    console.log(`
╔═══════════════════════════════════════════╗
║   TCG Singles Platform - Backend Server   ║
║              Running on port ${port}              ║
╚═══════════════════════════════════════════╝
  `);
  });

  server.on('error', (err: any) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`[FATAL] Port ${port} already in use. Stop other processes or set PORT to a different value.`);
      process.exit(1);
    }
    throw err;
  });

  return server;
}

export default app;

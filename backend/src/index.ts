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

// Import error utilities
import { ApplicationError } from './utils/errors.js';

// Import routes
import tcgRoutes from './routes/tcg.routes.js';
import cardRoutes from './routes/card.routes.js';
import listingRoutes from './routes/listing.routes.js';
import inventoryRoutes from './routes/inventory.routes.js';
import cartRoutes from './routes/cart.routes.js';
import healthRoutes from './routes/health.routes.js';
import externalRoutes from './routes/external.routes.js';
import adminRoutes from './routes/admin.routes.js';
import { startPriceSyncCron } from './jobs/priceSync.job.js';
import { startCatalogSyncCron } from './jobs/catalogSync.job.js';

const app: Express = express();
const PORT = process.env.PORT || 3000;

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

// ============================================
// ROUTES
// ============================================

app.use('/api/health', healthRoutes);
app.use('/api/tcgs', tcgRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/external', externalRoutes);
app.use('/api/admin', adminRoutes);

// ============================================
// ERROR HANDLING
// ============================================

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const isAppError = err instanceof ApplicationError;
  const statusCode: number = err.statusCode || 500;
  const message: string = err.message || 'Internal Server Error';
  const code: string = err.code || (statusCode >= 500 ? 'INTERNAL_ERROR' : 'ERROR');

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

app.listen(PORT, () => {
  startPriceSyncCron();
  startCatalogSyncCron();

  console.log(`
╔═══════════════════════════════════════════╗
║   TCG Singles Platform - Backend Server   ║
║              Running on port ${PORT}              ║
╚═══════════════════════════════════════════╝
  `);
});

export default app;

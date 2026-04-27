import express, { Request, Response } from 'express';
import AnalyticsService from '../services/AnalyticsService.js';
import requireAdmin from '../middleware/requireAdmin.js';
import tenantResolver from '../middleware/tenantResolver.js';
import requirePermission from '../middleware/requirePermission.js';

const router = express.Router();

router.use(requireAdmin);
router.use(tenantResolver);

/**
 * GET /api/analytics/sales-summary
 */
router.get('/sales-summary', requirePermission('view', 'analytics'), async (req: Request, res: Response) => {
  const summary = await AnalyticsService.getSalesSummary(req.store?.id);
  res.json({ success: true, summary });
});

/**
 * GET /api/analytics/revenue-by-tcg
 */
router.get('/revenue-by-tcg', requirePermission('view', 'analytics'), async (req: Request, res: Response) => {
  const data = await AnalyticsService.getRevenueByTCG(req.store?.id);
  res.json({ success: true, data });
});

export default router;

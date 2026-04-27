import express, { Request, Response } from 'express';
import { z } from 'zod';
import CouponService from '../services/CouponService.js';
import { ValidationError } from '../utils/errors.js';

const router = express.Router();

const validateSchema = z.object({
  code: z.string().min(1),
  cartTotal: z.coerce.number().min(0),
});

/**
 * GET /api/storefront/coupons/validate?code=XYZ&cartTotal=10000
 */
router.get('/validate', async (req: Request, res: Response) => {
  const storeId = req.header('x-store-id') || req.query.storeId;
  if (!storeId) throw new ValidationError('Store ID is required');

  const { code, cartTotal } = validateSchema.parse(req.query);
  
  const result = await CouponService.validateCoupon(String(storeId), code, cartTotal);
  res.json({ success: true, ...result });
});

export default router;

import express, { Request, Response } from 'express';
import { z } from 'zod';
import CustomerAuthService from '../services/CustomerAuthService.js';
import OrderService from '../services/OrderService.js';
import { ValidationError, UnauthorizedError } from '../utils/errors.js';

const router = express.Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
  phone: z.string().optional(),
  address: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

/**
 * Helper to get storeId from header or body
 */
function getStoreId(req: Request) {
  const storeId = req.header('x-store-id') || req.body.storeId;
  if (!storeId) throw new ValidationError('Store ID is required');
  return String(storeId);
}

router.post('/register', async (req: Request, res: Response) => {
  const storeId = getStoreId(req);
  const body = registerSchema.parse(req.body);
  
  const result = await CustomerAuthService.register({
    storeId,
    email: body.email,
    password: body.password,
    name: body.name,
    phone: body.phone,
    address: body.address,
  });

  res.json({ success: true, ...result });
});

router.post('/login', async (req: Request, res: Response) => {
  const storeId = getStoreId(req);
  const body = loginSchema.parse(req.body);
  
  const result = await CustomerAuthService.login({
    storeId,
    email: body.email,
    password: body.password,
  });

  res.json({ success: true, ...result });
});

router.get('/me', async (req: Request, res: Response) => {
  const authHeader = req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('No token provided');
  }

  const token = authHeader.split(' ')[1];
  const customer = await CustomerAuthService.validateToken(token);
  
  if (!customer) {
    throw new UnauthorizedError('Invalid or expired token');
  }

  const { passwordHash, ...safe } = customer as any;
  res.json({ success: true, customer: safe });
});

router.get('/orders', async (req: Request, res: Response) => {
  const authHeader = req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedError('No token provided');
  
  const token = authHeader.split(' ')[1];
  const customer = await CustomerAuthService.validateToken(token);
  if (!customer) throw new UnauthorizedError('Invalid or expired token');

  const { orders, total } = await OrderService.listOrders({
    customerId: customer.id,
    take: 50,
  });

  res.json({ success: true, total, orders });
});

export default router;

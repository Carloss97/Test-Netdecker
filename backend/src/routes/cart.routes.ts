// src/routes/cart.routes.ts
import express, { Request, Response } from 'express';
import { CartService } from '../services/CartService.js';
import { ValidationError } from '../utils/errors.js';

const router = express.Router();

/**
 * GET /api/cart/:sessionId
 * Get cart by session ID
 */
router.get('/:sessionId', async (req: Request, res: Response) => {
  const cart = await CartService.getCart(req.params.sessionId);
  res.json(cart);
});

/**
 * POST /api/cart/:sessionId/add
 * Add item to cart
 */
router.post('/:sessionId/add', async (req: Request, res: Response) => {
  const { listingId, quantity } = req.body;
  if (!listingId || !quantity) {
    throw new ValidationError('listingId and quantity are required');
  }

  const cart = await CartService.addToCart({
    sessionId: req.params.sessionId,
    listingId,
    quantity: Number(quantity)
  });

  res.json(cart);
});

/**
 * POST /api/cart/:sessionId/checkout
 * Checkout cart
 */
router.post('/:sessionId/checkout', async (req: Request, res: Response) => {
  const { customerEmail, shippingAddress, notes } = req.body;
  if (!customerEmail) {
    throw new ValidationError('customerEmail is required');
  }

  const order = await CartService.checkout(
    req.params.sessionId,
    customerEmail,
    shippingAddress,
    notes
  );

  res.status(201).json(order);
});

/**
 * PATCH /api/cart/:sessionId/item/:itemId
 * Update item quantity
 */
router.patch('/:sessionId/item/:itemId', async (req: Request, res: Response) => {
  const { quantity } = req.body;
  if (quantity === undefined) {
    throw new ValidationError('quantity is required');
  }

  const cart = await CartService.updateItemQuantity(
    req.params.sessionId,
    req.params.itemId,
    Number(quantity)
  );

  res.json(cart);
});

/**
 * DELETE /api/cart/:sessionId/item/:itemId
 * Remove item from cart
 */
router.delete('/:sessionId/item/:itemId', async (req: Request, res: Response) => {
  const cart = await CartService.removeFromCart(
    req.params.sessionId,
    req.params.itemId
  );

  res.json(cart);
});

export default router;

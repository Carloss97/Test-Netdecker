// src/routes/cart.routes.ts
import express, { Request, Response } from 'express';
import { CartService } from '../services/CartService.js';

const router = express.Router();

/**
 * GET /api/cart/:sessionId
 * Get cart by session ID
 */
router.get('/:sessionId', async (req: Request, res: Response) => {
  try {
    const cart = await CartService.getCart(req.params.sessionId);
    res.json(cart);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/cart/:sessionId/add
 * Add item to cart
 */
router.post('/:sessionId/add', async (req: Request, res: Response) => {
  try {
    const { listingId, quantity } = req.body;
    if (!listingId || !quantity) {
      return res.status(400).json({ error: 'listingId and quantity are required' });
    }

    const cart = await CartService.addToCart({
      sessionId: req.params.sessionId,
      listingId,
      quantity: Number(quantity)
    });

    res.json(cart);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/cart/:sessionId/checkout
 * Checkout cart
 */
router.post('/:sessionId/checkout', async (req: Request, res: Response) => {
  try {
    const { customerEmail, shippingAddress, notes } = req.body;
    if (!customerEmail) {
      return res.status(400).json({ error: 'customerEmail is required' });
    }

    const order = await CartService.checkout(
      req.params.sessionId,
      customerEmail,
      shippingAddress,
      notes
    );

    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * PATCH /api/cart/:sessionId/item/:itemId
 * Update item quantity
 */
router.patch('/:sessionId/item/:itemId', async (req: Request, res: Response) => {
  try {
    const { quantity } = req.body;
    if (quantity === undefined) {
      return res.status(400).json({ error: 'quantity is required' });
    }

    const cart = await CartService.updateItemQuantity(
      req.params.sessionId,
      req.params.itemId,
      Number(quantity)
    );

    res.json(cart);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * DELETE /api/cart/:sessionId/item/:itemId
 * Remove item from cart
 */
router.delete('/:sessionId/item/:itemId', async (req: Request, res: Response) => {
  try {
    const cart = await CartService.removeFromCart(
      req.params.sessionId,
      req.params.itemId
    );

    res.json(cart);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;

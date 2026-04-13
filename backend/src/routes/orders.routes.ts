import express, { Request, Response } from 'express';
import { z } from 'zod';
import OrderService from '../services/OrderService.js';
import { ValidationError } from '../utils/errors.js';
import OrderReceiptPdfService from '../services/OrderReceiptPdfService.js';

const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
  const take = Math.min(Number(req.query.take ? Number(req.query.take) : 20), 100);
  const skip = Number(req.query.skip ? Number(req.query.skip) : 0);
  const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;

  const { orders, total } = await OrderService.listOrders({ take, skip, status });
  res.json({ success: true, total, orders });
});

router.get('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const order = await OrderService.getOrder(id);
  res.json({ success: true, order });
});

const cancelSchema = z.object({ performedBy: z.string().optional() });

router.post('/:id/cancel', async (req: Request, res: Response) => {
  const parsed = cancelSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message || 'Invalid payload');

  const id = String(req.params.id);
  const updated = await OrderService.cancelOrder(id, parsed.data.performedBy || null);
  res.json({ success: true, order: updated });
});

router.post('/:id/ship', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const updated = await OrderService.shipOrder(id, null);
  res.json({ success: true, order: updated });
});

router.post('/:id/deliver', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const updated = await OrderService.deliverOrder(id, null);
  res.json({ success: true, order: updated });
});

router.get('/:id/receipt', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  try {
    const buf = await OrderReceiptPdfService.generatePdfForOrder(id);
    const order = await (await import('../utils/db.js')).default.order.findUnique({ where: { id } });
    const filename = order ? `receipt-${order.orderNumber || id}.pdf` : `receipt-${id}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err: any) {
    console.error('Order receipt error', err?.message || err);
    res.status(404).json({ success: false, message: 'Receipt not available' });
  }
});

export default router;

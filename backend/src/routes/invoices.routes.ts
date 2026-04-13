import express from 'express';
import { z } from 'zod';
import InvoiceService from '../services/InvoiceService.js';

const router = express.Router();

const issueSchema = z.object({ orderId: z.string().trim().min(1) });

router.post('/', async (req, res) => {
  const parsed = issueSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'Invalid payload' });

  const invoice = await InvoiceService.createInvoiceForOrder(parsed.data.orderId);
  res.json({ success: true, invoice });
});

router.get('/:id', async (req, res) => {
  const id = req.params.id;
  // Simple getter: return invoice if exists
  const db = await import('../utils/db.js');
  const invoice = await (db.default as any).invoice.findUnique({ where: { id } });
  if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
  res.json({ success: true, invoice });
});

export default router;

import express from 'express';
import { z } from 'zod';
import InvoiceService from '../services/InvoiceService.js';
import InvoicePdfService from '../services/InvoicePdfService.js';

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

// Download or stream PDF for invoice
router.get('/:id/pdf', async (req, res) => {
  const id = req.params.id;
  try {
    const pdfBuffer = await InvoicePdfService.generatePdfForInvoice(id);
    const db = await import('../utils/db.js');
    const invoice = await (db.default as any).invoice.findUnique({ where: { id } });
    const filename = invoice ? `invoice-${invoice.invoiceNumber || id}.pdf` : `invoice-${id}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err: any) {
    console.error('Invoice PDF error', err?.message || err);
    res.status(500).json({ success: false, message: 'Could not generate invoice PDF' });
  }
});

// Manual cleanup trigger (disabled by default). Enable by setting ENABLE_INVOICE_CLEANUP_ENDPOINT=true
router.post('/cleanup', async (_req, res) => {
  if (process.env.ENABLE_INVOICE_CLEANUP_ENDPOINT !== 'true') {
    return res.status(403).json({ success: false, message: 'Invoice cleanup endpoint disabled' });
  }

  try {
    const job = await import('../jobs/invoiceCleanup.job.js');
    const result = await job.cleanupOldInvoices();
    res.json({ success: true, result });
  } catch (err: any) {
    console.error('Invoice cleanup trigger error', err?.message || err);
    res.status(500).json({ success: false, message: 'Invoice cleanup failed' });
  }
});

export default router;

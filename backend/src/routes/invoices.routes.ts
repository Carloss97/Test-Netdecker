import express from 'express';
import { z } from 'zod';
import InvoiceService from '../services/InvoiceService.js';
import InvoicePdfService from '../services/InvoicePdfService.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/errors.js';

const router = express.Router();

const issueSchema = z.object({ orderId: z.string().trim().min(1) });

router.post('/', async (req, res) => {
  const parsed = issueSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message || 'Invalid payload');

  const invoice = await InvoiceService.createInvoiceForOrder(parsed.data.orderId);
  res.json({ success: true, invoice });
});

router.get('/:id', async (req, res) => {
  const id = req.params.id;
  const db = await import('../utils/db.js');
  const invoice = await (db.default as any).invoice.findUnique({ where: { id } });
  if (!invoice) throw new NotFoundError('Invoice not found');
  res.json({ success: true, invoice });
});

// Download or stream PDF for invoice
router.get('/:id/pdf', async (req, res) => {
  const id = req.params.id;
  const pdfBuffer = await InvoicePdfService.generatePdfForInvoice(id);
  const db = await import('../utils/db.js');
  const invoice = await (db.default as any).invoice.findUnique({ where: { id } });
  const filename = invoice ? `invoice-${invoice.invoiceNumber || id}.pdf` : `invoice-${id}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(pdfBuffer);
});

// Manual cleanup trigger (disabled by default). Enable by setting ENABLE_INVOICE_CLEANUP_ENDPOINT=true
router.post('/cleanup', async (_req, res) => {
  if (process.env.ENABLE_INVOICE_CLEANUP_ENDPOINT !== 'true') {
    throw new ForbiddenError('Invoice cleanup endpoint disabled');
  }

  const job = await import('../jobs/invoiceCleanup.job.js');
  const result = await job.cleanupOldInvoices();
  res.json({ success: true, result });
});

export default router;

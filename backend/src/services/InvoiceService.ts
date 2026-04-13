import prisma from '../utils/db.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import InvoicePdfService from './InvoicePdfService.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class InvoiceService {
  static generateInvoiceNumber(storeId?: string | null) {
    return `INV-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`;
  }

  static async createInvoiceForOrder(orderId: string) {
    if (!orderId) throw new ValidationError('orderId is required');

    const result = await prisma.$transaction(async (tx: any) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
      if (!order) throw new NotFoundError('Order not found');

      const invoiceNumber = this.generateInvoiceNumber(order.storeId);

      const invoice = await tx.invoice.create({
        data: {
          orderId: order.id,
          storeId: order.storeId || null,
          invoiceNumber,
          date: new Date(),
          total: Number(order.total || 0),
          currency: (order as any).currency || 'CLP'
        }
      });

      return { invoice, order };
    });

    const { invoice, order } = result as any;

    // Persist PDF to storage (default: local public/invoices). For tests or quick runs, you can skip by setting SKIP_INVOICE_PDF_SAVE=true
    if (process.env.SKIP_INVOICE_PDF_SAVE === 'true') {
      return invoice;
    }

    try {
      const pdfBuffer = await InvoicePdfService.renderPdf({ invoice, order });

      // Determine storage directory
      const storageDir = process.env.INVOICE_STORAGE_DIR
        ? path.resolve(process.env.INVOICE_STORAGE_DIR)
        : path.resolve(__dirname, '../../public/invoices');

      await fs.mkdir(storageDir, { recursive: true });
      const filename = `${invoice.invoiceNumber || invoice.id}.pdf`;
      const filePath = path.join(storageDir, filename);
      await fs.writeFile(filePath, pdfBuffer);

      const pdfUrl = `/invoices/files/${filename}`;
      await prisma.invoice.update({ where: { id: invoice.id }, data: { pdfUrl } });
      (invoice as any).pdfUrl = pdfUrl;
    } catch (err: any) {
      console.error('Failed to generate or persist invoice PDF:', err?.message || err);
    }

    return invoice;
  }
}

export default InvoiceService;

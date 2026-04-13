import PDFDocument from 'pdfkit';
import prisma from '../utils/db.js';
import { NotFoundError } from '../utils/errors.js';

export class InvoicePdfService {
  static async renderPdf(context: { invoice: any; order?: any }): Promise<Buffer> {
    const { invoice, order } = context;

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Uint8Array[] = [];

      doc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      // Header
      doc.fontSize(20).text('Factura / Invoice', { align: 'center' });
      doc.moveDown();

      doc.fontSize(12).text(`Número: ${invoice.invoiceNumber}`);
      doc.text(`Fecha: ${new Date(invoice.date).toLocaleString()}`);
      doc.text(`Orden: ${invoice.orderId || 'N/A'}`);
      doc.moveDown();

      // Order items table (if available)
      if (order && Array.isArray(order.items) && order.items.length) {
        doc.fontSize(12).text('Items:');
        doc.moveDown(0.3);

        // Table header
        const startX = doc.x;
        doc.fontSize(10).text('Cant', startX, doc.y, { width: 60 });
        doc.text('Descripción', startX + 60, doc.y, { width: 280 });
        doc.text('Precio U.', startX + 350, doc.y, { width: 80, align: 'right' });
        doc.text('Subtotal', startX + 440, doc.y, { width: 80, align: 'right' });
        doc.moveDown(0.5);

        for (const it of order.items) {
          const desc = (it.description || it.listingId || '').toString();
          doc.text(String(it.quantity), { width: 60 });
          doc.text(desc, { continued: false, width: 280 });
          doc.text(String(it.pricePerUnit ?? ''), { width: 80, align: 'right' });
          doc.text(String(it.subtotal ?? ''), { width: 80, align: 'right' });
          doc.moveDown(0.25);
        }
      }

      doc.moveDown();
      doc.fontSize(12).text(`Total: ${invoice.total} ${invoice.currency || 'CLP'}`, { align: 'right' });

      doc.end();
    });
  }

  static async generatePdfForInvoice(invoiceId: string): Promise<Buffer> {
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundError('Invoice not found');

    const order = invoice.orderId ? await prisma.order.findUnique({ where: { id: invoice.orderId }, include: { items: true } }) : null;

    return this.renderPdf({ invoice, order });
  }
}

export default InvoicePdfService;

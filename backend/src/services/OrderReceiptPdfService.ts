import PDFDocument from 'pdfkit';
import prisma from '../utils/db.js';
import { NotFoundError } from '../utils/errors.js';

export class OrderReceiptPdfService {
  static async renderPdf(context: { order: any }): Promise<Buffer> {
    const { order } = context;

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks: Uint8Array[] = [];

      doc.on('data', (c: Uint8Array) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      doc.fontSize(18).text('Recibo / Receipt', { align: 'center' });
      doc.moveDown();

      doc.fontSize(12).text(`Order: ${order.orderNumber || order.id}`);
      doc.text(`Fecha: ${new Date(order.createdAt || Date.now()).toLocaleString()}`);
      doc.moveDown();

      if (Array.isArray(order.items) && order.items.length) {
        doc.fontSize(11).text('Items:');
        doc.moveDown(0.3);
        for (const it of order.items) {
          doc.text(`${it.quantity} x ${it.listingId} @ ${it.pricePerUnit} = ${it.subtotal}`);
        }
      }

      doc.moveDown();
      doc.fontSize(12).text(`Total: ${order.total} ${order.currency || 'CLP'}`, { align: 'right' });

      doc.end();
    });
  }

  static async generatePdfForOrder(orderId: string): Promise<Buffer> {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw new NotFoundError('Order not found');
    return this.renderPdf({ order });
  }
}

export default OrderReceiptPdfService;

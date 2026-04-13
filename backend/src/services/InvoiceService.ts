import prisma from '../utils/db.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

export class InvoiceService {
  static generateInvoiceNumber(storeId?: string | null) {
    return `INV-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`;
  }

  static async createInvoiceForOrder(orderId: string) {
    if (!orderId) throw new ValidationError('orderId is required');

    return prisma.$transaction(async (tx: any) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
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

      return invoice;
    });
  }
}

export default InvoiceService;

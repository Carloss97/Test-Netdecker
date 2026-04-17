import prisma from '../utils/db.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';

export class OrderService {
  static async listOrders(params: { take?: number; skip?: number; status?: string } = {}) {
    const take = params.take ?? 20;
    const skip = params.skip ?? 0;
    const where = params.status ? { status: params.status } : undefined;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: {
          items: {
            include: {
              listing: {
                include: {
                  card: { select: { cardName: true, cardCode: true, imageUrl: true } },
                  edition: { select: { editionCode: true, editionName: true } },
                },
              },
            },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return { orders, total };
  }

  static async getOrder(id: string) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            listing: {
              include: {
                card: { select: { cardName: true, cardCode: true, imageUrl: true } },
                edition: { select: { editionCode: true, editionName: true } },
              },
            },
          },
        },
      },
    });

    if (!order) throw new NotFoundError('Order not found');
    return order;
  }

  static async cancelOrder(orderId: string, performedBy?: string | null) {
    return prisma.$transaction(async (tx: any) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
      if (!order) throw new NotFoundError('Order not found');
      if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
        throw new ConflictError('Order already cancelled or refunded');
      }

      const listingIds = order.items.map((it: any) => it.listingId);
      const listings = await tx.listing.findMany({ where: { id: { in: listingIds } } });
      const listingMap = new Map(listings.map((l: any) => [l.id, l]));

      for (const it of order.items as any[]) {
        const listing = listingMap.get((it as any).listingId) as any;
        // best-effort: if listing missing, skip stock restore
        if (!listing) continue;

        await tx.stockMovement.create({
          data: {
            listingId: it.listingId,
            warehouseId: null,
            quantity: it.quantity,
            type: 'IN',
            reference: `order_cancel:${order.id}`,
            performedBy: performedBy || null,
          },
        });

        await tx.listing.update({ where: { id: it.listingId }, data: { quantity: Number(listing.quantity || 0) + Number((it as any).quantity || 0) } });
      }

      const updated = await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' }, include: { items: true } });
      return updated;
    });
  }

  static async shipOrder(orderId: string, _performedBy?: string | null) {
    return prisma.$transaction(async (tx: any) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundError('Order not found');
      if (order.status === 'SHIPPED' || order.status === 'DELIVERED') {
        throw new ConflictError('Order already shipped or delivered');
      }
      if (!['PENDING', 'CONFIRMED'].includes(order.status)) {
        throw new ConflictError(`Cannot ship order in status ${order.status}`);
      }

      const updated = await tx.order.update({ where: { id: orderId }, data: { status: 'SHIPPED' } });
      return updated;
    });
  }

  static async deliverOrder(orderId: string, _performedBy?: string | null) {
    return prisma.$transaction(async (tx: any) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundError('Order not found');
      if (order.status === 'DELIVERED') {
        throw new ConflictError('Order already delivered');
      }
      if (order.status !== 'SHIPPED') {
        throw new ConflictError('Only shipped orders can be marked delivered');
      }

      const updated = await tx.order.update({ where: { id: orderId }, data: { status: 'DELIVERED' } });
      return updated;
    });
  }
}

export default OrderService;

import prisma from '../utils/db.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';
import AuditService from './AuditService.js';
import EmailNotificationService from './EmailNotificationService.js';

export class OrderService {
  static async listOrders(params: { take?: number; skip?: number; status?: string; fulfillmentStatus?: string; storeId?: string; customerId?: string } = {}) {
    const take = params.take ?? 20;
    const skip = params.skip ?? 0;
    const where = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.fulfillmentStatus ? { fulfillmentStatus: params.fulfillmentStatus } : {}),
      ...(params.storeId ? { storeId: params.storeId } : {}),
      ...(params.customerId ? { customerId: params.customerId } : {}),
    };

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

  static async getOrder(id: string, storeId?: string) {
    const order = await prisma.order.findFirst({
      where: {
        id,
        ...(storeId ? { storeId } : {}),
      },
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

  static async cancelOrder(orderId: string, performedBy?: string | null, storeId?: string) {
    return prisma.$transaction(async (tx: any) => {
      const order = await tx.order.findFirst({
        where: {
          id: orderId,
          ...(storeId ? { storeId } : {}),
        },
        include: { items: true },
      });
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

      const updated = await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' }, include: { items: true, store: true } });

      await AuditService.auditEntityChange({
        entityType: 'order',
        entityId: order.id,
        operation: 'UPDATE',
        oldValue: { status: order.status },
        newValue: { status: 'CANCELLED' },
        changedBy: performedBy || null,
        action: 'ORDER.CANCEL',
      });

      // Notify customer
      void EmailNotificationService.sendOrderStatusEmail(updated as any, 'CANCELLED');

      return updated;
    });
  }

  static async shipOrder(orderId: string, performedBy?: string | null, storeId?: string) {
    return prisma.$transaction(async (tx: any) => {
      const order = await tx.order.findFirst({
        where: {
          id: orderId,
          ...(storeId ? { storeId } : {}),
        },
      });
      if (!order) throw new NotFoundError('Order not found');
      if (order.status === 'SHIPPED' || order.status === 'DELIVERED') {
        throw new ConflictError('Order already shipped or delivered');
      }
      if (!['PENDING', 'CONFIRMED'].includes(order.status)) {
        throw new ConflictError(`Cannot ship order in status ${order.status}`);
      }

      const updated = await tx.order.update({ where: { id: order.id }, data: { status: 'SHIPPED' } });

      await AuditService.auditEntityChange({
        entityType: 'order',
        entityId: order.id,
        operation: 'UPDATE',
        oldValue: { status: order.status },
        newValue: { status: 'SHIPPED' },
        changedBy: performedBy || null,
        action: 'ORDER.SHIP',
      });

      return updated;
    });
  }

  static async deliverOrder(orderId: string, performedBy?: string | null, storeId?: string) {
    return prisma.$transaction(async (tx: any) => {
      const order = await tx.order.findFirst({
        where: {
          id: orderId,
          ...(storeId ? { storeId } : {}),
        },
      });
      if (!order) throw new NotFoundError('Order not found');
      if (order.status === 'DELIVERED') {
        throw new ConflictError('Order already delivered');
      }
      if (order.status !== 'SHIPPED') {
        throw new ConflictError('Only shipped orders can be marked delivered');
      }

      const updated = await tx.order.update({ where: { id: order.id }, data: { status: 'DELIVERED' } });

      await AuditService.auditEntityChange({
        entityType: 'order',
        entityId: order.id,
        operation: 'UPDATE',
        oldValue: { status: order.status },
        newValue: { status: 'DELIVERED' },
        changedBy: performedBy || null,
        action: 'ORDER.DELIVER',
      });

      return updated;
    });
  }

  static async updateFulfillmentStatus(orderId: string, status: any, performedBy?: string | null, storeId?: string) {
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        ...(storeId ? { storeId } : {}),
      },
    });
    if (!order) throw new NotFoundError('Order not found');

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { fulfillmentStatus: status },
      include: { store: true },
    });

    await AuditService.auditEntityChange({
      entityType: 'order',
      entityId: order.id,
      operation: 'UPDATE',
      oldValue: { fulfillmentStatus: order.fulfillmentStatus },
      newValue: { fulfillmentStatus: status },
      changedBy: performedBy || null,
      action: 'ORDER.FULFILLMENT_UPDATE',
    });

    // Notify customer of fulfillment status change
    void EmailNotificationService.sendOrderStatusEmail(updated as any, status);

    return updated;
  }
}

export default OrderService;

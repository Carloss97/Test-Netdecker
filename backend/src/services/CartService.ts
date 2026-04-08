import prisma from '../utils/db.js';
import { Prisma } from '@prisma/client';
import { ListingService } from './ListingService.js';

interface AddToCartInput {
  sessionId: string;
  listingId: string;
  quantity: number;
}

export class CartService {
  /**
   * Calculate stock available for reservation: total quantity minus quantity
   * already reserved in active carts (excluding the current session).
   */
  private static async getAvailableStock(
    listingId: string,
    excludeSessionId?: string,
    excludeItemId?: string,
  ): Promise<number> {
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { quantity: true },
    });
    if (!listing) return 0;

    // Sum quantities in carts that belong to OTHER sessions (reserved by others)
    const reservedByOthers = await prisma.orderItem.aggregate({
      where: {
        listingId,
        orderId: null, // still in a cart (not checked out)
        ...(excludeSessionId
          ? {
              cart: {
                sessionId: { not: excludeSessionId },
              },
            }
          : {}),
        ...(excludeItemId ? { id: { not: excludeItemId } } : {}),
      },
      _sum: { quantity: true },
    });

    const reserved = reservedByOthers._sum.quantity ?? 0;
    return Math.max(listing.quantity - reserved, 0);
  }
  static async getOrCreateCart(sessionId: string) {
    const existing = await prisma.cart.findFirst({
      where: { sessionId },
      orderBy: { updatedAt: 'desc' },
      include: {
        items: {
          include: {
            listing: {
              include: { card: true }
            }
          }
        }
      }
    });

    if (existing) {
      return existing;
    }

    return prisma.cart.create({
      data: { sessionId },
      include: {
        items: {
          include: {
            listing: {
              include: { card: true }
            }
          }
        }
      }
    });
  }

  static async getCart(sessionId: string) {
    return this.getOrCreateCart(sessionId);
  }

  static async addToCart(input: AddToCartInput) {
    if (input.quantity <= 0) {
      throw new Error('Quantity must be greater than 0');
    }

    const listing = await ListingService.getListing(input.listingId);
    if (!listing) {
      throw new Error('Listing not found');
    }

    const cart = await this.getOrCreateCart(input.sessionId);

    const existingItem = await prisma.orderItem.findFirst({
      where: {
        cartId: cart.id,
        listingId: input.listingId,
        orderId: null
      }
    });

    const currentCartQty = existingItem?.quantity ?? 0;
    const desiredTotal = currentCartQty + input.quantity;

    // Available stock = total stock - quantity reserved by OTHER sessions
    const availableForSession = await this.getAvailableStock(
      input.listingId,
      input.sessionId,
    );

    if (availableForSession < desiredTotal) {
      throw new Error(
        `Insufficient stock. Available: ${availableForSession}, requested: ${desiredTotal}`,
      );
    }

    if (existingItem) {
      await prisma.orderItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: desiredTotal,
          subtotal: desiredTotal * listing.finalPrice,
          pricePerUnit: listing.finalPrice
        }
      });
    } else {
      await prisma.orderItem.create({
        data: {
          cartId: cart.id,
          listingId: input.listingId,
          quantity: input.quantity,
          pricePerUnit: listing.finalPrice,
          subtotal: input.quantity * listing.finalPrice
        }
      });
    }

    return this.getOrCreateCart(input.sessionId);
  }

  static async removeFromCart(sessionId: string, itemId: string) {
    const cart = await this.getOrCreateCart(sessionId);

    await prisma.orderItem.deleteMany({
      where: {
        id: itemId,
        cartId: cart.id,
        orderId: null
      }
    });

    return this.getOrCreateCart(sessionId);
  }

  static async updateItemQuantity(sessionId: string, itemId: string, quantity: number) {
    if (quantity <= 0) {
      return this.removeFromCart(sessionId, itemId);
    }

    const cart = await this.getOrCreateCart(sessionId);
    const item = await prisma.orderItem.findFirst({
      where: {
        id: itemId,
        cartId: cart.id,
        orderId: null
      },
      include: { listing: true }
    });

    if (!item) {
      throw new Error('Cart item not found');
    }

    // Check available stock for this session (excluding the current item's reservation)
    const availableForSession = await this.getAvailableStock(
      item.listingId,
      sessionId,
      itemId,
    );

    if (availableForSession < quantity) {
      throw new Error(
        `Insufficient stock. Available: ${availableForSession}, requested: ${quantity}`,
      );
    }

    await prisma.orderItem.update({
      where: { id: itemId },
      data: {
        quantity,
        subtotal: quantity * item.listing.finalPrice,
        pricePerUnit: item.listing.finalPrice
      }
    });

    return this.getOrCreateCart(sessionId);
  }

  static async checkout(sessionId: string, customerEmail: string, shippingAddress?: string, notes?: string) {
    const cart = await this.getOrCreateCart(sessionId);
    if (!cart.items.length) {
      throw new Error('Cart is empty');
    }
    type CartItemShape = {
      id: string;
      listingId: string;
      quantity: number;
      subtotal: number;
      listing?: { finalPrice: number } | null;
    };

    for (const item of cart.items as CartItemShape[]) {
      const currentListing = await prisma.listing.findUnique({ where: { id: item.listingId } });
      if (!currentListing || currentListing.quantity < item.quantity) {
        throw new Error(`Insufficient stock for listing ${item.listingId}`);
      }
    }

    const subtotal = (cart.items as CartItemShape[]).reduce((sum: number, item: CartItemShape) => sum + item.subtotal, 0);
    const tax = 0;
    const total = subtotal + tax;
    const orderNumber = `ORD-${Date.now()}`;

    const order = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const createdOrder = await tx.order.create({
        data: {
          orderNumber,
          customerEmail,
          status: 'PENDING',
          subtotal,
          tax,
          total,
          shippingAddress,
          notes
        }
      });

      for (const item of cart.items as CartItemShape[]) {
        await tx.listing.update({
          where: { id: item.listingId },
          data: { quantity: { decrement: item.quantity } }
        });

        await tx.orderItem.update({
          where: { id: item.id },
          data: {
            orderId: createdOrder.id,
            cartId: null
          }
        });
      }

      return createdOrder;
    });

    return order;
  }
}

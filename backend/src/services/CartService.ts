import prisma from '../utils/db.js';
import { Prisma } from '@prisma/client';
import { ListingService } from './ListingService.js';
import { ValidationError, NotFoundError, ConflictError } from '../utils/errors.js';

interface AddToCartInput {
  storeId: string;
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
  static async getOrCreateCart(sessionId: string, storeId: string) {
    const existing = await prisma.cart.findFirst({
      where: { sessionId, storeId },
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
      const expiryMinutes = Number(process.env.CART_EXPIRY_MINUTES ?? '60');
      const expiresAt = new Date(((existing.updatedAt as Date).getTime()) + expiryMinutes * 60 * 1000);
      const ttlSeconds = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
      return { ...existing, expiresAt, ttlSeconds } as any;
    }

    const created = await prisma.cart.create({
      data: { sessionId, storeId },
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

    const expiryMinutes = Number(process.env.CART_EXPIRY_MINUTES ?? '60');
    const expiresAt = new Date((created.updatedAt as Date).getTime() + expiryMinutes * 60 * 1000);
    const ttlSeconds = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    return { ...created, expiresAt, ttlSeconds } as any;
  }

  static async getCart(sessionId: string, storeId: string) {
    return this.getOrCreateCart(sessionId, storeId);
  }

  static async addToCart(input: AddToCartInput) {
    if (input.quantity <= 0) {
      throw new ValidationError('Quantity must be greater than 0');
    }

    const listing = await ListingService.getListing(input.listingId, input.storeId);
    if (!listing) {
      throw new NotFoundError('Listing not found');
    }

    const cart = await this.getOrCreateCart(input.sessionId, input.storeId);

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
      throw new ConflictError(`Insufficient stock. Available: ${availableForSession}, requested: ${desiredTotal}`);
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

    return this.getOrCreateCart(input.sessionId, input.storeId);
  }

  static async removeFromCart(sessionId: string, itemId: string, storeId: string) {
    const cart = await this.getOrCreateCart(sessionId, storeId);

    await prisma.orderItem.deleteMany({
      where: {
        id: itemId,
        cartId: cart.id,
        orderId: null
      }
    });

    return this.getOrCreateCart(sessionId, storeId);
  }

  static async updateItemQuantity(sessionId: string, itemId: string, quantity: number, storeId: string) {
    if (quantity <= 0) {
      return this.removeFromCart(sessionId, itemId, storeId);
    }

    const cart = await this.getOrCreateCart(sessionId, storeId);
    const item = await prisma.orderItem.findFirst({
      where: {
        id: itemId,
        cartId: cart.id,
        orderId: null
      },
      include: { listing: true }
    });

    if (!item) {
      throw new NotFoundError('Cart item not found');
    }

    // Check available stock for this session (excluding the current item's reservation)
    const availableForSession = await this.getAvailableStock(
      item.listingId,
      sessionId,
      itemId,
    );

    if (availableForSession < quantity) {
      throw new ConflictError(`Insufficient stock. Available: ${availableForSession}, requested: ${quantity}`);
    }

    await prisma.orderItem.update({
      where: { id: itemId },
      data: {
        quantity,
        subtotal: quantity * item.listing.finalPrice,
        pricePerUnit: item.listing.finalPrice
      }
    });

    return this.getOrCreateCart(sessionId, storeId);
  }

  static async checkout(sessionId: string, customerEmail: string, storeId: string, shippingAddress?: string, notes?: string) {
    const cart = await this.getOrCreateCart(sessionId, storeId);
    if (!cart.items.length) {
      throw new ValidationError('Cart is empty');
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
        throw new ConflictError(`Insufficient stock for listing ${item.listingId}`);
      }
    }

    const subtotal = (cart.items as CartItemShape[]).reduce((sum: number, item: CartItemShape) => sum + item.subtotal, 0);
    const tax = 0;
    const total = subtotal + tax;
    const orderNumber = `ORD-${Date.now()}`;

    const order = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const createdOrder = await tx.order.create({
        data: {
          storeId: cart.storeId,
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

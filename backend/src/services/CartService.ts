import prisma from '../utils/db.js';
import { ListingService } from './ListingService.js';

interface AddToCartInput {
  sessionId: string;
  listingId: string;
  quantity: number;
}

export class CartService {
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

    if (listing.quantity < input.quantity) {
      throw new Error('Insufficient stock');
    }

    const cart = await this.getOrCreateCart(input.sessionId);

    const existingItem = await prisma.orderItem.findFirst({
      where: {
        cartId: cart.id,
        listingId: input.listingId,
        orderId: null
      }
    });

    if (existingItem) {
      const newQuantity = existingItem.quantity + input.quantity;
      if (listing.quantity < newQuantity) {
        throw new Error('Insufficient stock for requested quantity');
      }

      await prisma.orderItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: newQuantity,
          subtotal: newQuantity * listing.finalPrice,
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

    if (item.listing.quantity < quantity) {
      throw new Error('Insufficient stock');
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

    for (const item of cart.items) {
      const currentListing = await prisma.listing.findUnique({ where: { id: item.listingId } });
      if (!currentListing || currentListing.quantity < item.quantity) {
        throw new Error(`Insufficient stock for listing ${item.listingId}`);
      }
    }

    const subtotal = cart.items.reduce((sum, item) => sum + item.subtotal, 0);
    const tax = 0;
    const total = subtotal + tax;
    const orderNumber = `ORD-${Date.now()}`;

    const order = await prisma.$transaction(async (tx) => {
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

      for (const item of cart.items) {
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

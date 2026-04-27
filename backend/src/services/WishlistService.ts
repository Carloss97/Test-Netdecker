import prisma from '../utils/db.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';

export class WishlistService {
  static async toggleWishlist(customerId: string, listingId: string) {
    const existing = await prisma.wishlist.findUnique({
      where: {
        customerId_listingId: { customerId, listingId }
      }
    });

    if (existing) {
      await prisma.wishlist.delete({ where: { id: existing.id } });
      return { active: false };
    }

    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundError('Listing no encontrado');

    await prisma.wishlist.create({
      data: { customerId, listingId }
    });

    return { active: true };
  }

  static async getCustomerWishlist(customerId: string) {
    return prisma.wishlist.findMany({
      where: { customerId },
      include: {
        listing: {
          include: {
            card: {
              include: { tcg: true, edition: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Identifies all customers that have a specific listing in their wishlist
   * when it comes back in stock.
   */
  static async checkStockAlerts() {
    // Find all wishlist items where listing.quantity > 0 
    // This could be more sophisticated (tracking if it was 0 before)
    return prisma.wishlist.findMany({
      where: {
        listing: { quantity: { gt: 0 } }
      },
      include: {
        customer: true,
        listing: { include: { card: true } }
      }
    });
  }
}

export default WishlistService;

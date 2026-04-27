import prisma from '../utils/db.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/errors.js';

export class ReviewService {
  static async createReview(input: {
    customerId: string;
    listingId: string;
    rating: number;
    comment?: string;
    images?: string[];
  }) {
    if (input.rating < 1 || input.rating > 5) {
      throw new ValidationError('La calificación debe estar entre 1 y 5 estrellas');
    }

    // Check if customer already reviewed this listing
    const existing = await prisma.review.findFirst({
      where: { customerId: input.customerId, listingId: input.listingId }
    });

    if (existing) {
      throw new ValidationError('Ya has calificado esta carta');
    }

    // Verify if customer has purchased this card (Optional but recommended for social proof)
    const purchase = await prisma.order.findFirst({
      where: {
        customerId: input.customerId,
        items: { some: { listingId: input.listingId } },
        status: { in: ['CONFIRMED', 'DELIVERED'] }
      }
    });

    // We allow reviews but mark them if not a verified purchase or block if strictly enforced
    const review = await prisma.review.create({
      data: {
        customerId: input.customerId,
        listingId: input.listingId,
        rating: input.rating,
        comment: input.comment,
        images: input.images ? JSON.stringify(input.images) : null,
        isApproved: true, // Auto-approve for MVP
      }
    });

    return review;
  }

  static async getListingReviews(listingId: string) {
    return prisma.review.findMany({
      where: { listingId, isApproved: true },
      include: {
        customer: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  static async getAverageRating(listingId: string) {
    const aggregate = await prisma.review.aggregate({
      where: { listingId, isApproved: true },
      _avg: { rating: true },
      _count: { rating: true }
    });

    return {
      average: aggregate._avg.rating || 0,
      count: aggregate._count.rating
    };
  }
}

export default ReviewService;

import prisma from '../utils/db.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';

export class CouponService {
  /**
   * Validates a coupon code for a specific store and cart total.
   */
  static async validateCoupon(storeId: string, code: string, cartTotal: number) {
    const coupon = await prisma.coupon.findUnique({
      where: {
        storeId_code: {
          storeId,
          code: code.toUpperCase().trim(),
        }
      }
    });

    if (!coupon || !coupon.isActive) {
      throw new NotFoundError('Cupón no válido o inactivo');
    }

    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      throw new ValidationError('El cupón ha expirado');
    }

    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
      throw new ValidationError('El cupón ha alcanzado su límite de uso');
    }

    if (cartTotal < coupon.minPurchase) {
      throw new ValidationError(`Monto mínimo de compra para este cupón: $${coupon.minPurchase.toLocaleString('es-CL')}`);
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.type === 'PERCENTAGE') {
      discountAmount = cartTotal * (coupon.value / 100);
      if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
        discountAmount = coupon.maxDiscount;
      }
    } else {
      discountAmount = coupon.value;
    }

    // Ensure discount doesn't exceed cart total
    discountAmount = Math.min(discountAmount, cartTotal);

    return {
      couponId: coupon.id,
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      discountAmount: Math.round(discountAmount),
    };
  }

  /**
   * Increments the usage count of a coupon.
   */
  static async incrementUsage(couponId: string, tx: any = prisma) {
    return tx.coupon.update({
      where: { id: couponId },
      data: { usageCount: { increment: 1 } }
    });
  }
}

export default CouponService;

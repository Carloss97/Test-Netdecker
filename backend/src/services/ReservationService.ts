import prisma from '../utils/db.js';

export class ReservationService {
  static async createReservation(input: {
    listingId: string;
    warehouseId?: string | null;
    quantity: number;
    reservedBy?: string | null;
    expiresAt?: Date | null;
  }) {
    return prisma.$transaction(async (tx: any) => {
      // Basic validation
      const listing = await tx.listing.findUnique({ where: { id: input.listingId } });
      if (!listing) throw new Error('Listing not found');

      if (input.quantity <= 0) throw new Error('Quantity must be > 0');

      const reservation = await tx.reservation.create({
        data: {
          listingId: input.listingId,
          warehouseId: input.warehouseId || null,
          quantity: input.quantity,
          reservedBy: input.reservedBy || null,
          expiresAt: input.expiresAt || null,
          status: 'ACTIVE'
        }
      });

      return reservation;
    });
  }

  static async releaseReservation(reservationId: string) {
    return prisma.$transaction(async (tx: any) => {
      const existing = await tx.reservation.findUnique({ where: { id: reservationId } });
      if (!existing) throw new Error('Reservation not found');
      if (existing.status !== 'ACTIVE') return existing;

      const updated = await tx.reservation.update({ where: { id: reservationId }, data: { status: 'RELEASED' } });
      return updated;
    });
  }

  static async commitReservation(reservationId: string) {
    return prisma.$transaction(async (tx: any) => {
      const reservation = await tx.reservation.findUnique({ where: { id: reservationId } });
      if (!reservation) throw new Error('Reservation not found');
      if (reservation.status !== 'ACTIVE') throw new Error('Reservation not active');

      const listing = await tx.listing.findUnique({ where: { id: reservation.listingId } });
      if (!listing) throw new Error('Listing not found');
      if (Number(listing.quantity || 0) < reservation.quantity) throw new Error('Insufficient stock to commit reservation');

      // Create an OUT movement to represent the committed sale
      await tx.stockMovement.create({
        data: {
          listingId: reservation.listingId,
          warehouseId: reservation.warehouseId || null,
          quantity: reservation.quantity,
          type: 'OUT',
          reference: `reservation:${reservation.id}`
        }
      });

      // Decrease global listing quantity
      await tx.listing.update({ where: { id: reservation.listingId }, data: { quantity: Number(listing.quantity || 0) - reservation.quantity } });

      // Mark reservation as committed
      const updated = await tx.reservation.update({ where: { id: reservationId }, data: { status: 'COMMITTED' } });

      return updated;
    });
  }
}

export default ReservationService;

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

      // --- Accounting integration (best-effort): create journal entries for revenue and COGS if accounts exist ---
      try {
        const storeId = listing.storeId || null;

        // Find accounts by type for this store (best-effort)
        const revenueAccount = await tx.account.findFirst({ where: { storeId, type: 'REVENUE' } });
        const assetAccount = await tx.account.findFirst({ where: { storeId, type: 'ASSET' } });
        const expenseAccount = await tx.account.findFirst({ where: { storeId, type: 'EXPENSE' } });

        const qty = Number(reservation.quantity || 0);
        const unitPrice = Number(listing.finalPrice || 0);
        const saleAmount = unitPrice * qty;

        if (saleAmount > 0 && revenueAccount && assetAccount) {
          // Create revenue journal entry: Debit Asset (cash/AR), Credit Revenue
          await tx.journalEntry.create({
            data: {
              storeId,
              description: `Sale reservation:${reservation.id}`,
              date: new Date(),
              totalDebit: saleAmount,
              totalCredit: saleAmount,
              lines: {
                create: [
                  { accountId: assetAccount.id, debit: saleAmount, credit: 0, description: 'Sale proceeds' },
                  { accountId: revenueAccount.id, debit: 0, credit: saleAmount, description: 'Sales revenue' },
                ]
              }
            }
          });
        }

        const costPerUnit = Number(listing.costPrice || 0);
        const costAmount = costPerUnit * qty;

        if (costAmount > 0 && expenseAccount && assetAccount) {
          // Create COGS journal entry: Debit Expense (COGS), Credit Asset (Inventory)
          await tx.journalEntry.create({
            data: {
              storeId,
              description: `COGS reservation:${reservation.id}`,
              date: new Date(),
              totalDebit: costAmount,
              totalCredit: costAmount,
              lines: {
                create: [
                  { accountId: expenseAccount.id, debit: costAmount, credit: 0, description: 'Cost of goods sold' },
                  { accountId: assetAccount.id, debit: 0, credit: costAmount, description: 'Inventory decrease' },
                ]
              }
            }
          });
        }
      } catch (err) {
        // Best-effort: do not fail the whole transaction if accounting cannot be recorded
      }

      return updated;
    });
  }
}

export default ReservationService;

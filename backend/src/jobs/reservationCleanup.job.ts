import cron from 'node-cron';
import prisma from '../utils/db.js';

let isRunning = false;

export async function runReservationCleanup() {
  if (isRunning) {
    console.log('[ReservationCleanupJob] Previous run still in progress. Skipping.');
    return { skipped: true, processed: 0 };
  }

  isRunning = true;
  try {
    const now = new Date();
    const expired = await prisma.reservation.findMany({ where: { status: 'ACTIVE', expiresAt: { lte: now } } });

    if (!expired.length) {
      console.log('[ReservationCleanupJob] No expired reservations found.');
      return { processed: 0 };
    }

    console.log(`[ReservationCleanupJob] Found ${expired.length} expired reservations`);

    let processed = 0;

    for (const r of expired) {
      try {
        // Best-effort: if a stockMovement exists for this reservation (OUT), create an IN to return stock.
        const movements = await prisma.stockMovement.findMany({ where: { reference: `reservation:${r.id}` } });

        if (movements && movements.length > 0) {
          // If there is an OUT movement, create a compensating IN movement and increase listing quantity
          const outQty = movements.filter((m: any) => m.type === 'OUT').reduce((s: number, m: any) => s + (m.quantity || 0), 0);
          if (outQty > 0) {
            await prisma.stockMovement.create({ data: { listingId: r.listingId, warehouseId: r.warehouseId || null, quantity: outQty, type: 'IN', reference: `reservation:${r.id}:revert`, performedBy: 'system', notes: 'Revert expired reservation' } });
            await prisma.listing.update({ where: { id: r.listingId }, data: { quantity: { increment: outQty } } });
          }
        }

        await prisma.reservation.update({ where: { id: r.id }, data: { status: 'EXPIRED' } });
        processed++;
      } catch (err) {
        console.error('[ReservationCleanupJob] Failed processing reservation', r.id, err);
      }
    }

    console.log(`[ReservationCleanupJob] Processed ${processed} expired reservations`);
    return { processed };
  } finally {
    isRunning = false;
  }
}

export function startReservationCleanupCron() {
  const enabled = process.env.RESERVATION_CLEANUP_ENABLED !== 'false';
  if (!enabled) {
    console.log('[ReservationCleanupJob] Disabled by RESERVATION_CLEANUP_ENABLED=false');
    return;
  }

  const schedule = process.env.RESERVATION_CLEANUP_CRON || '*/5 * * * *';
  if (!cron.validate(schedule)) {
    console.error(`[ReservationCleanupJob] Invalid cron expression: ${schedule}`);
    return;
  }

  cron.schedule(schedule, async () => {
    if (isRunning) return;
    try {
      await runReservationCleanup();
    } catch (err) {
      // logged in runReservationCleanup
    }
  });

  console.log(`[ReservationCleanupJob] Scheduled with cron expression: ${schedule}`);
}

export default runReservationCleanup;

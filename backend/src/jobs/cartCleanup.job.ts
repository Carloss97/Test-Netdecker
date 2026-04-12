import cron from 'node-cron';
import prisma from '../utils/db.js';

let isRunning = false;

export async function runCartCleanup(expiryMinutes?: number) {
  if (isRunning) {
    console.log('[CartCleanupJob] Previous run still in progress. Skipping run.');
    return { skipped: true, deletedItems: 0, deletedCarts: 0 };
  }

  isRunning = true;
  try {
    const minutes = Number(expiryMinutes ?? Number(process.env.CART_EXPIRY_MINUTES ?? '60'));
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);

    const staleCarts = await prisma.cart.findMany({
      where: { updatedAt: { lt: cutoff } },
      select: { id: true, sessionId: true }
    });

    if (!staleCarts.length) {
      console.log('[CartCleanupJob] No stale carts found.');
      return { deletedItems: 0, deletedCarts: 0 };
    }

    console.log(`[CartCleanupJob] Found ${staleCarts.length} carts older than ${minutes} minutes`);

    let totalDeletedItems = 0;
    let totalDeletedCarts = 0;

    for (const c of staleCarts) {
      const del = await prisma.orderItem.deleteMany({ where: { cartId: c.id, orderId: null } });
      totalDeletedItems += del.count ?? 0;

      await prisma.cart.delete({ where: { id: c.id } });
      totalDeletedCarts++;
    }

    console.log(`[CartCleanupJob] Deleted ${totalDeletedItems} cart items and ${totalDeletedCarts} carts`);
    return { deletedItems: totalDeletedItems, deletedCarts: totalDeletedCarts };
  } catch (err) {
    console.error('[CartCleanupJob] Failed:', err);
    throw err;
  } finally {
    isRunning = false;
  }
}

export function startCartCleanupCron() {
  const enabled = process.env.CART_CLEANUP_ENABLED !== 'false';
  if (!enabled) {
    console.log('[CartCleanupJob] Disabled by CART_CLEANUP_ENABLED=false');
    return;
  }

  const schedule = process.env.CART_CLEANUP_CRON || '*/15 * * * *';

  if (!cron.validate(schedule)) {
    console.error(`[CartCleanupJob] Invalid cron expression: ${schedule}`);
    return;
  }

  cron.schedule(schedule, async () => {
    if (isRunning) {
      console.log('[CartCleanupJob] Previous run still in progress. Skipping this tick.');
      return;
    }

    try {
      await runCartCleanup();
    } catch (err) {
      // already logged inside runCartCleanup
    }
  });

  console.log(`[CartCleanupJob] Scheduled with cron expression: ${schedule}`);
}

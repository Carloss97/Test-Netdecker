import cron from 'node-cron';
import { PriceSyncService } from '../services/PriceSyncService.js';

let isRunning = false;

export function startPriceSyncCron() {
  const enabled = process.env.PRICE_SYNC_ENABLED !== 'false';
  if (!enabled) {
    console.log('[PriceSyncJob] Disabled by PRICE_SYNC_ENABLED=false');
    return;
  }

  const schedule = process.env.PRICE_SYNC_CRON || '0 */6 * * *';

  if (!cron.validate(schedule)) {
    console.error(`[PriceSyncJob] Invalid cron expression: ${schedule}`);
    return;
  }

  cron.schedule(schedule, async () => {
    if (isRunning) {
      console.log('[PriceSyncJob] Previous run still in progress. Skipping this tick.');
      return;
    }

    isRunning = true;

    try {
      const result = await PriceSyncService.runPriceSync({
        source: 'cron',
        notes: `Cron execution (${schedule})`,
        inventoryOnly: false,
      });

      console.log(
        `[PriceSyncJob] Completed run ${result.runId}: total=${result.total}, updated=${result.updated}, volatile=${result.volatile}, failed=${result.failed}`
      );
    } catch (error) {
      console.error('[PriceSyncJob] Failed:', error);
    } finally {
      isRunning = false;
    }
  });

  console.log(`[PriceSyncJob] Scheduled with cron expression: ${schedule}`);
}

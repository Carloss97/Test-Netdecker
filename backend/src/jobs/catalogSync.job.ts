import cron from 'node-cron';
import { CatalogSyncService } from '../services/CatalogSyncService.js';

let isRunning = false;

export function startCatalogSyncCron() {
  const enabled = process.env.CATALOG_SYNC_ENABLED !== 'false';
  if (!enabled) {
    console.log('[CatalogSyncJob] Disabled by CATALOG_SYNC_ENABLED=false');
    return;
  }

  const schedule = process.env.CATALOG_SYNC_CRON || '0 3 * * *';

  if (!cron.validate(schedule)) {
    console.error(`[CatalogSyncJob] Invalid cron expression: ${schedule}`);
    return;
  }

  cron.schedule(schedule, async () => {
    if (isRunning) {
      console.log('[CatalogSyncJob] Previous run still in progress. Skipping this tick.');
      return;
    }

    isRunning = true;

    try {
      const result = await CatalogSyncService.syncNewSets({
        createListings: true,
        initialQuantity: 0,
      });

      console.log(
        `[CatalogSyncJob] Completed: scanned=${result.scannedSets}, new=${result.newSets}, updated=${result.updatedSets}, created=${result.createdCards}, updatedCards=${result.updatedCards}, skipped=${result.skippedCards}`
      );
    } catch (error) {
      console.error('[CatalogSyncJob] Failed:', error);
    } finally {
      isRunning = false;
    }
  });

  console.log(`[CatalogSyncJob] Scheduled with cron expression: ${schedule}`);
}

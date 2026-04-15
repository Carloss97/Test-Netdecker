import cron from 'node-cron';
import { CatalogSyncService } from '../services/CatalogSyncService.js';

let isRunning = false;

// Optional Prometheus metrics (prom-client is an optional dependency)
let jobSuccessCounter: any = null;
let jobFailureCounter: any = null;
(async () => {
  try {
    const prom = await import('prom-client');
    try {
      jobSuccessCounter = new prom.Counter({
        name: 'job_runs_success_total',
        help: 'Number of successful job runs',
        labelNames: ['job'],
      });

      jobFailureCounter = new prom.Counter({
        name: 'job_runs_failure_total',
        help: 'Number of failed job runs',
        labelNames: ['job'],
      });
    } catch (e) {
      // ignore duplicate registration errors
    }
  } catch (e) {
    // prom-client not available; metrics disabled
  }
})();

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
      try {
        if (jobSuccessCounter) jobSuccessCounter.inc({ job: 'catalog_sync' });
      } catch (e) {
        // swallow metric errors
      }
    } catch (error) {
      console.error('[CatalogSyncJob] Failed:', error);
      try {
        if (jobFailureCounter) jobFailureCounter.inc({ job: 'catalog_sync' });
      } catch (e) {
        // swallow metric errors
      }
    } finally {
      isRunning = false;
    }
  });

  console.log(`[CatalogSyncJob] Scheduled with cron expression: ${schedule}`);
}

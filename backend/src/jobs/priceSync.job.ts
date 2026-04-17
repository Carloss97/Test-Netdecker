import cron from 'node-cron';
import { PriceSyncService } from '../services/PriceSyncService.js';

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
      // ignore duplicate metric registration errors
    }
  } catch (e) {
    // prom-client not available; metrics disabled
  }
})();

export function startPriceSyncCron() {
  const enabled = process.env.PRICE_SYNC_ENABLED !== 'false';
  if (!enabled) {
    console.log('[PriceSyncJob] Disabled by PRICE_SYNC_ENABLED=false');
    return;
  }

  const isDevelopment = process.env.NODE_ENV === 'development';
  const devSafeModeEnabled = isDevelopment && process.env.PRICE_SYNC_DEV_SAFE_MODE !== 'false';

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
      const runOptions = devSafeModeEnabled
        ? {
            source: 'cron' as const,
            notes: `Cron execution (${schedule}) [dev-safe mode]`,
            inventoryOnly: true,
            fetchExternalPrices: false,
          }
        : {
            source: 'cron' as const,
            notes: `Cron execution (${schedule})`,
            inventoryOnly: false,
          };

      const result = await PriceSyncService.runPriceSync({
        ...runOptions,
      });

      console.log(
        `[PriceSyncJob] Completed run ${result.runId}: total=${result.total}, updated=${result.updated}, volatile=${result.volatile}, failed=${result.failed}`
      );
      try {
        if (jobSuccessCounter) jobSuccessCounter.inc({ job: 'price_sync' });
      } catch (e) {
        // swallow metric errors
      }
    } catch (error) {
      console.error('[PriceSyncJob] Failed:', error);
      try {
        if (jobFailureCounter) jobFailureCounter.inc({ job: 'price_sync' });
      } catch (e) {
        // swallow metric errors
      }
    } finally {
      isRunning = false;
    }
  });

  console.log(`[PriceSyncJob] Scheduled with cron expression: ${schedule}`);
  if (devSafeModeEnabled) {
    console.log('[PriceSyncJob] Development safe mode enabled: inventoryOnly=true, fetchExternalPrices=false');
  }
}

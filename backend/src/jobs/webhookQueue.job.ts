import cron from 'node-cron';
import WebhookQueueService from '../services/WebhookQueueService.js';
import { isLocalOnlyMode, parseBooleanEnv } from '../config/appConfig.js';

let isRunning = false;

export function startWebhookQueueCron() {
  const enabled = parseBooleanEnv(process.env.WEBHOOK_QUEUE_ENABLED, !isLocalOnlyMode());
  if (!enabled) {
    console.log('[WebhookQueueJob] Disabled. Set WEBHOOK_QUEUE_ENABLED=true to enable queued payment webhooks.');
    return;
  }

  if (!WebhookQueueService.isQueueAvailable()) {
    console.warn('[WebhookQueueJob] Disabled because webhook queue tables are unavailable in the current Prisma client.');
    return;
  }

  const schedule = process.env.WEBHOOK_QUEUE_CRON || '*/5 * * * * *';
  if (!cron.validate(schedule)) {
    console.error(`[WebhookQueueJob] Invalid cron expression: ${schedule}`);
    return;
  }

  cron.schedule(schedule, async () => {
    if (isRunning) {
      console.log('[WebhookQueueJob] Previous run still in progress. Skipping this tick.');
      return;
    }

    isRunning = true;
    try {
      await WebhookQueueService.processQueue();
    } catch (error) {
      console.error('[WebhookQueueJob] Failed:', error);
    } finally {
      isRunning = false;
    }
  });

  console.log(`[WebhookQueueJob] Scheduled with cron expression: ${schedule}`);
}
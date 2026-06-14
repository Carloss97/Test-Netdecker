import cron from 'node-cron';
import WebhookQueueService from '../services/WebhookQueueService.js';

let isRunning = false;

export function startWebhookQueueCron() {
  const enabled = process.env.WEBHOOK_QUEUE_ENABLED !== 'false';
  if (!enabled) {
    console.log('[WebhookQueueJob] Disabled by WEBHOOK_QUEUE_ENABLED=false');
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
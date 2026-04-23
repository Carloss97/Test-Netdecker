import cron from 'node-cron';
import ApiKeyService from '../services/ApiKeyService.js';

let isRunning = false;

export function startApiKeyRotationJob() {
  const enabled = process.env.API_KEY_ROTATION_ENABLED !== 'false';
  if (!enabled) {
    console.log('[ApiKeyRotationJob] Disabled by API_KEY_ROTATION_ENABLED=false');
    return;
  }

  const schedule = process.env.API_KEY_ROTATION_CRON || '0 0 1 * *';
  if (!cron.validate(schedule)) {
    console.error(`[ApiKeyRotationJob] Invalid cron expression: ${schedule}`);
    return;
  }

  cron.schedule(schedule, async () => {
    if (isRunning) {
      console.log('[ApiKeyRotationJob] Previous run still in progress. Skipping this tick.');
      return;
    }

    isRunning = true;
    try {
      await ApiKeyService.ensureBootstrapKeys();
      const rotated = await ApiKeyService.rotateExpiredKeys();
      if (rotated.length > 0) {
        console.log(`[ApiKeyRotationJob] Rotated ${rotated.length} expired api key(s)`);
      }
    } catch (error) {
      console.error('[ApiKeyRotationJob] Failed:', error);
    } finally {
      isRunning = false;
    }
  });

  console.log(`[ApiKeyRotationJob] Scheduled with cron expression: ${schedule}`);
}
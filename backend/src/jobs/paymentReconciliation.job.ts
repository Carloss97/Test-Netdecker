import cron from 'node-cron';
import PaymentReconciliationService from '../services/PaymentReconciliationService.js';
import { isLocalOnlyMode, parseBooleanEnv } from '../config/appConfig.js';

let isRunning = false;

export function startPaymentReconciliationCron() {
  const enabled = parseBooleanEnv(process.env.PAYMENT_RECONCILIATION_ENABLED, !isLocalOnlyMode());
  if (!enabled) {
    console.log('[PaymentReconciliationJob] Disabled. Set PAYMENT_RECONCILIATION_ENABLED=true to enable external payment reconciliation.');
    return;
  }

  const schedule = process.env.PAYMENT_RECONCILIATION_CRON || '0 2 * * *';
  if (!cron.validate(schedule)) {
    console.error(`[PaymentReconciliationJob] Invalid cron expression: ${schedule}`);
    return;
  }

  cron.schedule(schedule, async () => {
    if (isRunning) {
      console.log('[PaymentReconciliationJob] Previous run still in progress. Skipping this tick.');
      return;
    }

    isRunning = true;
    try {
      const result = await PaymentReconciliationService.reconcileDaily();
      console.log(
        `[PaymentReconciliationJob] Completed report ${result.reportId}: stripe=${result.totalStripeTransactions}, orders=${result.totalLocalOrders}, discrepancies=${result.totalDiscrepancies}`
      );
    } catch (error) {
      console.error('[PaymentReconciliationJob] Failed:', error);
    } finally {
      isRunning = false;
    }
  });

  console.log(`[PaymentReconciliationJob] Scheduled with cron expression: ${schedule}`);
}

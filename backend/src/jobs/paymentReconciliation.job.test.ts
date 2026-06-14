import test from 'node:test';
import assert from 'node:assert/strict';

test('payment reconciliation cron is disabled by default in local TCGCSV-only mode', async () => {
  const originalLocalOnly = process.env.LOCAL_ONLY_MODE;
  const originalTcgcsvOnly = process.env.TCGCSV_ONLY_MODE;
  const originalEnabled = process.env.PAYMENT_RECONCILIATION_ENABLED;
  const originalSkipDb = process.env.SKIP_DB_INIT;
  const originalLog = console.log;
  const logs: string[] = [];

  try {
    process.env.LOCAL_ONLY_MODE = 'true';
    process.env.TCGCSV_ONLY_MODE = 'true';
    process.env.SKIP_DB_INIT = 'true';
    delete process.env.PAYMENT_RECONCILIATION_ENABLED;
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(' '));
    };

    const { startPaymentReconciliationCron } = await import('./paymentReconciliation.job.js');
    startPaymentReconciliationCron();

    assert.ok(
      logs.some((line) => line.includes('[PaymentReconciliationJob] Disabled')),
      'expected local mode to disable payment reconciliation by default',
    );
  } finally {
    if (originalLocalOnly === undefined) delete process.env.LOCAL_ONLY_MODE;
    else process.env.LOCAL_ONLY_MODE = originalLocalOnly;

    if (originalTcgcsvOnly === undefined) delete process.env.TCGCSV_ONLY_MODE;
    else process.env.TCGCSV_ONLY_MODE = originalTcgcsvOnly;

    if (originalEnabled === undefined) delete process.env.PAYMENT_RECONCILIATION_ENABLED;
    else process.env.PAYMENT_RECONCILIATION_ENABLED = originalEnabled;

    if (originalSkipDb === undefined) delete process.env.SKIP_DB_INIT;
    else process.env.SKIP_DB_INIT = originalSkipDb;

    console.log = originalLog;
  }
});

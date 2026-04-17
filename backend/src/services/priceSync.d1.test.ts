import test from 'node:test';
import assert from 'node:assert/strict';

test('PriceSyncService.runPriceSync delegates to D1 implementation when USE_D1=true', async () => {
  const orig = process.env.USE_D1;
  process.env.USE_D1 = 'true';
  try {
    const svcModule = await import('./PriceSyncService.js');
    const PriceSyncService = svcModule.PriceSyncService || svcModule.default?.PriceSyncService || svcModule;

    const input = { source: 'manual', updates: [{ cardId: 'card-d1-test', referencePrice: 5.5 }] };
    const res = await PriceSyncService.runPriceSync(input as any);
    assert.ok(res && typeof res.runId === 'string');
    assert.equal(res.total, 1);
    // Should have created or updated one listing
    assert.ok(res.updated >= 1);
  } finally {
    if (orig === undefined) delete process.env.USE_D1; else process.env.USE_D1 = orig;
  }
});

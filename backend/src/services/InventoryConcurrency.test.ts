import assert from 'node:assert/strict';
import { test } from 'node:test';
import prisma from '../utils/db.js';
import { InventoryService } from './InventoryService.js';

// This integration test requires a working database. When running locally
// during quick development, set `SKIP_DB_INIT=true` to skip it and use the
// local mocked test instead.
if (process.env.SKIP_DB_INIT) {
  test.skip('concurrent decrements do not oversell (integration) — skipped (SKIP_DB_INIT)', async () => {});
} else {
  test('concurrent decrements do not oversell', async () => {
    // Ensure dependent records exist (tcg, edition, card) then create listing with finite stock
    await prisma.tCG.upsert({ where: { name: 'TEST-TCG' }, update: { displayName: 'TEST TCG' }, create: { id: 't-1', name: 'TEST-TCG', displayName: 'TEST TCG' } });
    const edition = await prisma.edition.upsert({
      where: { tcgId_editionCode: { tcgId: 't-1', editionCode: 'E1' } },
      update: { editionName: 'Edition 1' },
      create: { id: 'e-1', tcgId: 't-1', editionCode: 'E1', editionName: 'Edition 1' }
    });
    await prisma.card.upsert({
      where: { tcgId_editionId_cardCode_rarity: { tcgId: 't-1', editionId: edition.id, cardCode: 'C1', rarity: 'R' } },
      update: { cardName: 'Test Card' },
      create: { id: 'c-1', tcgId: 't-1', editionId: edition.id, cardCode: 'C1', cardName: 'Test Card', rarity: 'R' }
    });

    // Create or replace a listing with finite stock
    const listing = await prisma.listing.upsert({
      where: { cardId_condition_rarity: { cardId: 'c-1', condition: 'NM', rarity: 'R' } },
      update: { quantity: 10, referencePrice: 1, finalPrice: 1000 },
      create: { cardId: 'c-1', editionId: 'e-1', condition: 'NM', rarity: 'R', quantity: 10, referencePrice: 1, finalPrice: 1000 }
    });

    const decrementAmount = 1;
    const attempts = 20; // 20 parallel attempts for 10 stock

    // Run parallel decrement attempts
    const results = await Promise.all(Array.from({ length: attempts }).map(async () => {
      try {
        return await InventoryService.decreaseListingQuantity(listing.id, decrementAmount);
      } catch (err) {
        return { error: true, message: (err as any).message };
      }
    }));

    const successCount = results.filter((r: any) => r && !r.error).length;
    const final = await prisma.listing.findUnique({ where: { id: listing.id } });

    // Diagnostic output for triage
    // eslint-disable-next-line no-console
    console.log('concurrency results:', JSON.stringify(results, null, 2));
    // eslint-disable-next-line no-console
    console.log('successCount:', successCount, 'finalQty:', final?.quantity);

    assert(final && final.quantity >= 0, 'Final quantity must be non-negative');
    assert.strictEqual(successCount, 10, 'Only 10 decrements should succeed');

    // cleanup
    await prisma.listing.delete({ where: { id: listing.id } });
    await prisma.card.delete({ where: { id: 'c-1' } });
    await prisma.edition.delete({ where: { id: 'e-1' } });
    await prisma.tCG.delete({ where: { id: 't-1' } });
  });
}

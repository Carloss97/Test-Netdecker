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
    // Ensure dependent records exist: use an existing valid TCG enum value
    const existingTcg = await prisma.tCG.findUnique({ where: { name: 'MAGIC' } });
    const tcgId = existingTcg?.id;
    if (!tcgId) throw new Error('Expected seeded TCG "MAGIC" to exist for tests');

    // Create or reuse a unique edition/card/listing for this test (avoid colliding with seeded data)
    const edition = await prisma.edition.upsert({
      where: { tcgId_editionCode: { tcgId, editionCode: 'TEST-E1' } },
      update: { editionName: 'Edition TEST E1' },
      create: { tcgId, editionCode: 'TEST-E1', editionName: 'Edition TEST E1' }
    });

    const card = await prisma.card.upsert({
      where: { tcgId_editionId_cardCode_rarity: { tcgId, editionId: edition.id, cardCode: 'TEST-C1', rarity: 'TEST-R' } },
      update: { cardName: 'Test Card' },
      create: { tcgId, editionId: edition.id, cardCode: 'TEST-C1', cardName: 'Test Card', rarity: 'TEST-R' }
    });

    // Create or replace a listing with finite stock (use the created card/edition ids)
    const listing = await prisma.listing.upsert({
      where: { cardId_condition_rarity: { cardId: card.id, condition: 'NM', rarity: 'TEST-R' } },
      update: { quantity: 10, referencePrice: 1, finalPrice: 1000 },
      create: { cardId: card.id, editionId: edition.id, condition: 'NM', rarity: 'TEST-R', quantity: 10, referencePrice: 1, finalPrice: 1000 }
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

    // cleanup created resources (do not delete seeded TCG)
    await prisma.listing.delete({ where: { id: listing.id } });
    await prisma.card.delete({ where: { id: card.id } });
    await prisma.edition.delete({ where: { id: edition.id } });
  });
}

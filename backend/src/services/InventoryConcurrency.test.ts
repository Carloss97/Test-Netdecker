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
    // Ensure dependent catalog records exist (tcg -> edition -> card)
    const _suffix = Math.random().toString(36).slice(2, 8);
    const tcg = await prisma.tCG.create({ data: { name: `TEST_TCG_${_suffix}`, displayName: 'Test TCG' } });
    const edition = await prisma.edition.create({ data: { tcgId: tcg.id, editionCode: `TEST_ED_${_suffix}`, editionName: 'Test Edition' } });
    const card = await prisma.card.create({ data: { tcgId: tcg.id, editionId: edition.id, cardCode: `TEST_CARD_${_suffix}`, cardName: 'Test Card', rarity: 'R' } });

    // Create a listing with finite stock
    const listing = await prisma.listing.create({ data: { cardId: card.id, editionId: edition.id, condition: 'NM', rarity: 'R', quantity: 10, referencePrice: 1, finalPrice: 1000 } });

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

    
    assert(final && final.quantity >= 0, 'Final quantity must be non-negative');
    assert.strictEqual(successCount, 10, 'Only 10 decrements should succeed');

    // cleanup
    await prisma.listing.delete({ where: { id: listing.id } });
    await prisma.card.delete({ where: { id: card.id } });
    await prisma.edition.delete({ where: { id: edition.id } });
    await prisma.tCG.delete({ where: { id: tcg.id } });
  });
}

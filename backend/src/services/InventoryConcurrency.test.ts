import assert from 'node:assert/strict';
import { test } from 'node:test';
import prisma from '../utils/db.js';
import { InventoryService } from './InventoryService.js';

// This test simulates concurrent decrements against the same listing to
// ensure the InventoryService uses an atomic-safe pattern and prevents
// overselling. It runs multiple parallel requests and asserts that the
// final quantity never goes below zero and that only the allowed number
// of decrements succeeded.

test('concurrent decrements do not oversell', async () => {
  // Create a listing with finite stock
  const listing = await prisma.listing.create({ data: { cardId: 'c-1', editionId: 'e-1', condition: 'NM', rarity: 'R', quantity: 10, referencePrice: 1, finalPrice: 1000 } });

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
});

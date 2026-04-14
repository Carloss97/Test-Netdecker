import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InventoryService } from './InventoryService.js';

// Local-only concurrency test that does not require a running Postgres.
// It uses an in-memory fake `prisma` implementation that provides the
// minimal `$transaction`/`tx.listing.updateMany` and `tx.stockMovement.create`
// behavior to simulate DB atomic updateMany semantics.

test('local concurrent decrements do not oversell (mocked DB)', async () => {
  const listingId = 'local-listing-1';
  // in-memory store
  const store = new Map<string, { quantity: number }>([[listingId, { quantity: 10 }]]);

  // Simple mutex to serialize the critical section and emulate atomic DB update
  let mutex = Promise.resolve();
  const withLock = async <T>(fn: () => Promise<T>): Promise<T> => {
    const previous = mutex;
    let release: () => void;
    mutex = new Promise<void>((res) => (release = res));
    await previous;
    try {
      return await fn();
    } finally {
      release!();
    }
  };

  const fakeTx = {
    listing: {
      updateMany: async ({ where, data }: any) => {
        return withLock(async () => {
          const id = where.id;
          const needed = where.quantity?.gte ?? 0;
          const current = store.get(id);
          if (!current) return { count: 0 };
          if (current.quantity >= needed) {
            if (data && data.quantity && typeof data.quantity.decrement === 'number') {
              current.quantity -= data.quantity.decrement;
            }
            return { count: 1 };
          }
          return { count: 0 };
        });
      }
    },
    stockMovement: {
      create: async ({ data }: any) => {
        // return a fake movement id
        return { id: 'm-' + Math.random().toString(36).slice(2, 9) };
      }
    }
  };

  const fakePrisma = {
    $transaction: async (cb: any) => {
      return cb(fakeTx);
    }
  };

  const attempts = 20;

  const results = await Promise.all(
    Array.from({ length: attempts }).map(async () => {
      try {
        return await InventoryService.decreaseListingQuantity(listingId, 1, fakePrisma);
      } catch (err: any) {
        return { error: true, message: err.message };
      }
    })
  );

  const successCount = results.filter((r: any) => r && !r.error).length;
  const finalQty = store.get(listingId)!.quantity;

  assert.strictEqual(successCount, 10, 'Only 10 decrements should succeed');
  assert(finalQty >= 0, 'Final quantity must be non-negative');
});

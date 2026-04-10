// scripts/backfill-warehouse-stock.ts
// Backfill per-warehouse stock from existing Listing.quantity values.
import prisma from '../src/utils/db.js';

async function main() {
  console.log('[backfill] Starting warehouse stock backfill...');

  // Ensure a global fallback warehouse for listings without storeId
  let global = await prisma.warehouse.findFirst({ where: { storeId: null, name: 'Global Warehouse' } });
  if (!global) {
    global = await prisma.warehouse.create({ data: { storeId: null, name: 'Global Warehouse' } });
    console.log('[backfill] Created Global Warehouse', global.id);
  }

  // Ensure a default warehouse exists per store
  const stores = await prisma.store.findMany();
  for (const s of stores) {
    const existing = await prisma.warehouse.findFirst({ where: { storeId: s.id, name: 'Default Warehouse' } });
    if (!existing) {
      const w = await prisma.warehouse.create({ data: { storeId: s.id, name: 'Default Warehouse' } });
      console.log('[backfill] Created Default Warehouse for store', s.slug, w.id);
    }
  }

  // Fetch listings with stock > 0
  const listings = await prisma.listing.findMany({ where: { quantity: { gt: 0 } }, select: { id: true, quantity: true, storeId: true } });
  console.log('[backfill] Listings to process:', listings.length);

  let processed = 0;
  for (const l of listings) {
    const qty = Number(l.quantity || 0);
    if (qty <= 0) continue;

    const storeId = l.storeId ?? null;
    let warehouse = null;

    if (storeId) {
      warehouse = await prisma.warehouse.findFirst({ where: { storeId, name: 'Default Warehouse' } });
    } else {
      warehouse = global;
    }

    if (!warehouse) {
      // Fallback: create one
      warehouse = await prisma.warehouse.create({ data: { storeId, name: storeId ? 'Default Warehouse' : 'Global Warehouse' } });
    }

    // Upsert warehouseStock
    const existingStock = await prisma.warehouseStock.findFirst({ where: { listingId: l.id, warehouseId: warehouse.id } });
    if (existingStock) {
      await prisma.warehouseStock.update({ where: { id: existingStock.id }, data: { quantity: qty } });
    } else {
      await prisma.warehouseStock.create({ data: { listingId: l.id, warehouseId: warehouse.id, quantity: qty } });
    }

    // Create initial snapshot
    await prisma.stockSnapshot.create({ data: { listingId: l.id, warehouseId: warehouse.id, quantity: qty } });

    // Create migration stock movement record (IN)
    await prisma.stockMovement.create({ data: { listingId: l.id, warehouseId: warehouse.id, quantity: qty, type: 'IN', reference: 'migration:initial-stock', notes: 'Backfill from listing.quantity' } });

    processed++;
    if (processed % 200 === 0) console.log(`[backfill] Processed ${processed}/${listings.length}`);
  }

  console.log('[backfill] Completed. Total processed:', processed);
  process.exit(0);
}

main().catch((err) => {
  console.error('[backfill] Error:', err);
  process.exit(1);
});

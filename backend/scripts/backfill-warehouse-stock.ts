// scripts/backfill-warehouse-stock.ts
// Backfill per-warehouse stock from existing Listing.quantity values.
import prisma from '../src/utils/db.js';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const LIMIT_INDEX = args.indexOf('--limit');
const LIMIT = LIMIT_INDEX >= 0 && args[LIMIT_INDEX + 1] ? Number(args[LIMIT_INDEX + 1]) : undefined;

async function main() {
  console.log('[backfill] Starting warehouse stock backfill...');
  console.log('[backfill] Mode:', APPLY ? 'apply' : 'dry-run', LIMIT ? `limit=${LIMIT}` : '');

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
  const findOpts: any = { where: { quantity: { gt: 0 } }, select: { id: true, quantity: true, storeId: true } };
  if (LIMIT && Number.isFinite(LIMIT)) findOpts.take = LIMIT;
  const listings = await prisma.listing.findMany(findOpts);
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

    // Upsert warehouseStock (idempotent)
    const existingStock = await prisma.warehouseStock.findFirst({ where: { listingId: l.id, warehouseId: warehouse.id } });
    const migrationExists = await prisma.stockMovement.findFirst({
      where: { listingId: l.id, warehouseId: warehouse.id, reference: 'migration:initial-stock' },
    });

    if (existingStock) {
      if (existingStock.quantity !== qty) {
        console.log(`[backfill] Update stock for listing=${l.id} warehouse=${warehouse.id} ${existingStock.quantity} -> ${qty}`);
        if (APPLY) {
          await prisma.warehouseStock.update({ where: { id: existingStock.id }, data: { quantity: qty } });
        }
      } else {
        if (!migrationExists) {
          console.log(`[backfill] Existing stock matches quantity but migration record missing for listing=${l.id}`);
        }
      }
    } else {
      console.log(`[backfill] Create stock for listing=${l.id} warehouse=${warehouse.id} qty=${qty}`);
      if (APPLY) {
        await prisma.warehouseStock.create({ data: { listingId: l.id, warehouseId: warehouse.id, quantity: qty } });
      }
    }

    // Create snapshot and migration movement only if missing
    if (!migrationExists) {
      console.log(`[backfill] Create snapshot + migration movement for listing=${l.id}`);
      if (APPLY) {
        await prisma.stockSnapshot.create({ data: { listingId: l.id, warehouseId: warehouse.id, quantity: qty } });
        await prisma.stockMovement.create({
          data: {
            listingId: l.id,
            warehouseId: warehouse.id,
            quantity: qty,
            type: 'IN',
            reference: 'migration:initial-stock',
            notes: 'Backfill from listing.quantity',
          },
        });
      }
    } else {
      if (!APPLY) {
        console.log(`[backfill] Skipping snapshot/movement for listing=${l.id} (migration record exists)`);
      }
    }

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

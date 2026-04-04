#!/usr/bin/env tsx
/**
 * resetCatalog.ts
 * ---------------
 * WARNING: Deletes ALL catalog data (cards, editions, listings, price history,
 * inventory imports, carts and orders) while preserving TCG records and
 * exchange-rate cache.
 *
 * Usage:
 *   npx tsx backend/src/scripts/resetCatalog.ts [--confirm]
 *
 * Pass --confirm to actually delete. Without it, only a dry-run is shown.
 */

import prisma from '../utils/db.js';

const dryRun = !process.argv.includes('--confirm');

async function main() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║      TCG Catalog Reset Script        ║');
  console.log('╚══════════════════════════════════════╝\n');

  if (dryRun) {
    console.log('🔍 DRY-RUN mode — pass --confirm to actually delete.\n');
  } else {
    console.log('⚠️  LIVE mode — data will be permanently deleted!\n');
  }

  const [
    cards, listings, priceHistory, imports, orderItems, orders, carts, editions,
  ] = await Promise.all([
    prisma.card.count(),
    prisma.listing.count(),
    prisma.priceHistory.count(),
    prisma.inventoryImport.count(),
    prisma.orderItem.count(),
    prisma.order.count(),
    prisma.cart.count(),
    prisma.edition.count(),
  ]);

  console.log('Current state:');
  console.log(`  Editions:        ${editions}`);
  console.log(`  Cards:           ${cards}`);
  console.log(`  Listings:        ${listings}`);
  console.log(`  Price history:   ${priceHistory}`);
  console.log(`  Inventory imports: ${imports}`);
  console.log(`  Orders/items:    ${orders} / ${orderItems}`);
  console.log(`  Carts:           ${carts}`);

  if (dryRun) {
    console.log('\nAll of the above would be deleted (except TCG records & exchange rates).');
    console.log('Re-run with --confirm to proceed.\n');
    await prisma.$disconnect();
    return;
  }

  console.log('\nDeleting data in dependency order…');

  // Delete in correct FK order
  await prisma.orderItem.deleteMany();
  console.log('  ✓ OrderItems deleted');
  await prisma.order.deleteMany();
  console.log('  ✓ Orders deleted');
  await prisma.cart.deleteMany();
  console.log('  ✓ Carts deleted');
  await prisma.priceHistory.deleteMany();
  console.log('  ✓ PriceHistory deleted');
  await prisma.priceSyncRun.deleteMany();
  console.log('  ✓ PriceSyncRuns deleted');
  await prisma.listing.deleteMany();
  console.log('  ✓ Listings deleted');
  await prisma.card.deleteMany();
  console.log('  ✓ Cards deleted');
  await prisma.edition.deleteMany();
  console.log('  ✓ Editions deleted');
  await prisma.inventoryImport.deleteMany();
  console.log('  ✓ InventoryImports deleted');

  console.log('\n✅ Catalog reset complete. TCG records and exchange rates preserved.');
  console.log('   Run `npm run prisma:seed` if you need to re-seed TCG records.\n');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});

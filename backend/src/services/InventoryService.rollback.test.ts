import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import { InventoryService } from './InventoryService.js';

test('rollbackImport reverts quantities when oldQuantity present', async () => {
  const originalFindMany = prisma.inventoryImportChange.findMany;
  const originalListingUpdate = prisma.listing.update;
  const originalInventoryImportUpdate = prisma.inventoryImport.update;

  try {
    prisma.inventoryImportChange.findMany = (async () => [
      { id: 'ch1', importId: 'imp1', listingId: 'L1', oldQuantity: 5, newQuantity: 2 }
    ]) as any;

    let updated = 0;
    prisma.listing.update = (async (args: any) => { updated++; return args; }) as any;
    prisma.inventoryImport.update = (async () => ({})) as any;

    const res: any = await InventoryService.rollbackImport('imp1', { force: false });
    assert.equal(res.reverted, 1);
    assert.equal(res.skipped, 0);
    assert.equal(updated, 1);
  } finally {
    prisma.inventoryImportChange.findMany = originalFindMany;
    prisma.listing.update = originalListingUpdate;
    prisma.inventoryImport.update = originalInventoryImportUpdate;
  }
});

test('rollbackImport deletes created listings when force=true', async () => {
  const originalFindMany = prisma.inventoryImportChange.findMany;
  const originalListingDelete = prisma.listing.delete;
  const originalListingFindUnique = prisma.listing.findUnique;
  const originalInventoryImportUpdate = prisma.inventoryImport.update;

  try {
    prisma.inventoryImportChange.findMany = (async () => [
      { id: 'ch2', importId: 'imp2', listingId: 'L2', oldQuantity: null, newQuantity: 3 }
    ]) as any;

    prisma.listing.findUnique = (async () => ({ id: 'L2' })) as any;
    let deleted = 0;
    prisma.listing.delete = (async (args: any) => { deleted++; return args; }) as any;
    prisma.inventoryImport.update = (async () => ({})) as any;

    const res: any = await InventoryService.rollbackImport('imp2', { force: true });
    assert.equal(res.reverted, 1);
    assert.equal(res.skipped, 0);
    assert.equal(deleted, 1);
  } finally {
    prisma.inventoryImportChange.findMany = originalFindMany;
    prisma.listing.delete = originalListingDelete;
    prisma.listing.findUnique = originalListingFindUnique;
    prisma.inventoryImport.update = originalInventoryImportUpdate;
  }
});

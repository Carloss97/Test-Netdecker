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

test('rollbackImport dryRun returns preview and does not mutate DB', async () => {
  const originalFindMany = prisma.inventoryImportChange.findMany;
  const originalListingUpdate = prisma.listing.update;
  const originalListingDelete = prisma.listing.delete;
  const originalListingFindUnique = prisma.listing.findUnique;

  try {
    prisma.inventoryImportChange.findMany = (async () => [
      { id: 'ch1', importId: 'impX', listingId: 'L1', oldQuantity: 5, newQuantity: 2 },
      { id: 'ch2', importId: 'impX', listingId: 'L2', oldQuantity: null, newQuantity: 3 }
    ]) as any;

    let updateCalled = 0;
    let deleteCalled = 0;
    prisma.listing.update = (async () => { updateCalled++; return {} as any; }) as any;
    prisma.listing.delete = (async () => { deleteCalled++; return {} as any; }) as any;
    prisma.listing.findUnique = (async () => ({ id: 'L2' })) as any;

    const res: any = await InventoryService.rollbackImport('impX', { force: true, dryRun: true });
    // dryRun should report planned actions and not call DB mutators
    assert.equal(res.reverted, 2);
    assert.equal(res.skipped, 0);
    assert.equal(Array.isArray(res.preview), true);
    assert.equal(updateCalled, 0);
    assert.equal(deleteCalled, 0);
  } finally {
    prisma.inventoryImportChange.findMany = originalFindMany;
    prisma.listing.update = originalListingUpdate;
    prisma.listing.delete = originalListingDelete;
    prisma.listing.findUnique = originalListingFindUnique;
  }
});

test('rollbackImport respects onlyListingIds filter', async () => {
  const originalFindMany = prisma.inventoryImportChange.findMany;
  const originalListingUpdate = prisma.listing.update;
  const originalListingDelete = prisma.listing.delete;
  const originalInventoryImportUpdate = prisma.inventoryImport.update;

  try {
    prisma.inventoryImportChange.findMany = (async () => [
      { id: 'ch1', importId: 'impY', listingId: 'L1', oldQuantity: 5, newQuantity: 2 },
      { id: 'ch2', importId: 'impY', listingId: 'L2', oldQuantity: null, newQuantity: 3 }
    ]) as any;

    let updated = 0;
    let deleted = 0;
    prisma.listing.update = (async (args: any) => { updated++; return args; }) as any;
    prisma.listing.delete = (async (args: any) => { deleted++; return args; }) as any;
    prisma.inventoryImport.update = (async () => ({})) as any;

    const res: any = await InventoryService.rollbackImport('impY', { force: true, onlyListingIds: ['L1'] });
    // only L1 should be reverted (update), L2 skipped
    assert.equal(res.reverted, 1);
    assert.equal(res.skipped >= 0, true);
    assert.equal(updated, 1);
    assert.equal(deleted, 0);
  } finally {
    prisma.inventoryImportChange.findMany = originalFindMany;
    prisma.listing.update = originalListingUpdate;
    prisma.listing.delete = originalListingDelete;
    prisma.inventoryImport.update = originalInventoryImportUpdate;
  }
});

test('rollbackImport reverts only entries for provided batchId', async () => {
  const originalFindMany = prisma.inventoryImportChange.findMany;
  const originalListingUpdate = prisma.listing.update;
  const originalInventoryImportUpdate = prisma.inventoryImport.update;

  try {
    prisma.inventoryImportChange.findMany = (async () => [
      { id: 'chB1', importId: 'impB', listingId: 'LB1', oldQuantity: 8, newQuantity: 3 }
    ]) as any;

    let updated = 0;
    prisma.listing.update = (async (args: any) => { updated++; return args; }) as any;
    prisma.inventoryImport.update = (async () => ({})) as any;

    const res: any = await InventoryService.rollbackImport('impB', { force: false, batchId: 'batch-B' });
    assert.equal(res.reverted, 1);
    assert.equal(res.skipped, 0);
    assert.equal(updated, 1);
  } finally {
    prisma.inventoryImportChange.findMany = originalFindMany;
    prisma.listing.update = originalListingUpdate;
    prisma.inventoryImport.update = originalInventoryImportUpdate;
  }
});

test('rollbackImport resolves batchIndex and reverts its entries', async () => {
  const originalFindMany = prisma.inventoryImportChange.findMany;
  const originalListingUpdate = prisma.listing.update;
  const originalImportBatchFind = prisma.importBatch.findFirst;
  const originalInventoryImportUpdate = prisma.inventoryImport.update;

  try {
    prisma.importBatch.findFirst = (async () => ({ id: 'batch-idx-1', importId: 'impIdx', batchIndex: 1 })) as any;

    prisma.inventoryImportChange.findMany = (async () => [
      { id: 'chIdx1', importId: 'impIdx', listingId: 'LI1', oldQuantity: 4, newQuantity: 1 }
    ]) as any;

    let updated = 0;
    prisma.listing.update = (async (args: any) => { updated++; return args; }) as any;
    prisma.inventoryImport.update = (async () => ({})) as any;

    const res: any = await InventoryService.rollbackImport('impIdx', { batchIndex: 1 });
    assert.equal(res.reverted, 1);
    assert.equal(res.skipped, 0);
    assert.equal(updated, 1);
  } finally {
    prisma.inventoryImportChange.findMany = originalFindMany;
    prisma.listing.update = originalListingUpdate;
    prisma.importBatch.findFirst = originalImportBatchFind;
    prisma.inventoryImport.update = originalInventoryImportUpdate;
  }
});

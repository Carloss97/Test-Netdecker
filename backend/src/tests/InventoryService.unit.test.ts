import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCsvRecords,
  parseCsv,
  detectImportMode,
  findDuplicateListingIds,
  validateListingUpdateRow,
  validateFullUpsertRow,
} from '../services/InventoryService.js';

test('parseCsvRecords handles quoted fields and CRLF', () => {
  const content = 'a,b,c\r\n"one, with comma","two""quote","three"\r\nx,y,z';
  const recs = parseCsvRecords(content);

  assert.deepEqual(recs[0], ['a', 'b', 'c']);
  assert.deepEqual(recs[1], ['one, with comma', 'two"quote', 'three']);
  assert.deepEqual(recs[2], ['x', 'y', 'z']);
});

test('parseCsv returns array of objects and preserves values', () => {
  const content = 'listingId,quantity\r\nL1,3\r\nL2,4';
  const rows = parseCsv(content);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].listingId, 'L1');
  assert.equal(rows[0].quantity, '3');
});

test('detectImportMode recognizes listing-update and full-upsert', () => {
  const listingRows = [{ listingId: 'L1', quantity: '2' } as any];
  const upsertRows = [{ tcg: 'MAGIC', editionCode: 'E1', cardCode: 'C1', cardName: 'N', quantity: '1', referencePrice: '10' } as any];

  assert.equal(detectImportMode(listingRows), 'listing-update');
  assert.equal(detectImportMode(upsertRows), 'full-upsert');
});

test('findDuplicateListingIds finds duplicates', () => {
  const rows = [{ listingId: 'L1' }, { listingId: 'L1' }, { listingId: 'L2' }];
  const dups = findDuplicateListingIds(rows as any);
  assert.deepEqual(dups.sort(), ['L1']);
});

test('validateListingUpdateRow parses and enforces duplicates', () => {
  const parsed = validateListingUpdateRow({ listingId: 'L1', quantity: '3' } as any, new Set());
  assert.equal(parsed.listingId, 'L1');
  assert.equal(parsed.quantity, 3);

  const dupSet = new Set<string>(['L1']);
  assert.throws(() => validateListingUpdateRow({ listingId: 'L1', quantity: '1' } as any, dupSet));
});

test('validateFullUpsertRow accepts valid rows and rejects invalid tcg', () => {
  const row = {
    tcg: 'MAGIC',
    editionCode: 'ED1',
    cardCode: 'C1',
    cardName: 'Card Name',
    quantity: '2',
    referencePrice: '10',
    marginMultiplier: '1.2',
  } as any;

  const parsed = validateFullUpsertRow(row);
  assert.equal(parsed.tcgType, 'MAGIC');
  assert.equal(parsed.quantity, 2);
  assert.equal(parsed.referencePrice, 10);

  const bad = { ...row, tcg: 'INVALID_TCG' } as any;
  assert.throws(() => validateFullUpsertRow(bad));
});

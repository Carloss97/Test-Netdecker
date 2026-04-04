import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvRecords, parseCsv, detectImportMode, findDuplicateListingIds } from './InventoryService.js';

test('parseCsvRecords handles quoted commas', () => {
  const content = 'cardName,notes\n"Lightning, Bolt","burn, instant"';
  const records = parseCsvRecords(content);

  assert.equal(records.length, 2);
  assert.equal(records[1][0], 'Lightning, Bolt');
  assert.equal(records[1][1], 'burn, instant');
});

test('parseCsvRecords handles escaped quotes', () => {
  const content = 'cardName,notes\n"He said ""hello""",ok';
  const records = parseCsvRecords(content);

  assert.equal(records[1][0], 'He said "hello"');
  assert.equal(records[1][1], 'ok');
});

test('parseCsv maps incomplete rows with empty values', () => {
  const content = 'listingId,quantity,cardName\nabc123,5\nxyz999,2,Pikachu';
  const rows = parseCsv(content);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].listingId, 'abc123');
  assert.equal(rows[0].quantity, '5');
  assert.equal(rows[0].cardName, '');
});

test('detectImportMode recognizes listing-update', () => {
  const rows = parseCsv('listingId,quantity\na,1\nb,2');
  const mode = detectImportMode(rows);
  assert.equal(mode, 'listing-update');
});

test('detectImportMode recognizes full-upsert', () => {
  const rows = parseCsv('tcg,editionCode,cardCode,cardName,quantity,referencePrice\nMAGIC,MH3,12,Bolt,3,2.5');
  const mode = detectImportMode(rows);
  assert.equal(mode, 'full-upsert');
});

test('findDuplicateListingIds detects duplicates', () => {
  const rows = parseCsv('listingId,quantity\nabc,1\ndef,2\nabc,3');
  const duplicates = findDuplicateListingIds(rows);

  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0], 'abc');
});

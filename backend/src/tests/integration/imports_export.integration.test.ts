// Ensure DB init is skipped so we can stub Prisma methods
process.env.SKIP_DB_INIT = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../../index.js';
import { InventoryService } from '../../services/InventoryService.js';

test('integration: exports import history as CSV', async (t) => {
  const origStreamExports = (InventoryService as any).streamImportsForExport;

  try {
    const createdAt = new Date('2026-04-01T00:00:00.000Z');
    const completedAt = new Date('2026-04-01T00:01:00.000Z');

    (InventoryService as any).streamImportsForExport = async function* () {
      yield {
        id: 'imp-123',
        fileName: 'import-test.csv',
        status: 'completed',
        totalRecords: 2,
        successCount: 2,
        failureCount: 0,
        importedBy: 'tester',
        createdAt,
        completedAt,
      } as any;
    };

    const server = app.listen(0);
    const addr = server.address();
    const port = (addr && typeof addr === 'object' && 'port' in addr) ? (addr as any).port : (addr as any);
    const base = `http://127.0.0.1:${port}`;

    const res = await fetch(`${base}/api/inventory/imports/export`);
    assert.equal(res.status, 200);
    const contentType = res.headers.get('content-type') || '';
    assert.ok(contentType.includes('text/csv'));

    const body = await res.text();
    const lines = body.split('\r\n');
    const expectedHeader = '"id","fileName","status","totalRecords","successCount","failureCount","importedBy","createdAt","completedAt"';
    assert.equal(lines[0], expectedHeader);

    const expectedLine = [
      '"imp-123"',
      '"import-test.csv"',
      '"completed"',
      '"2"',
      '"2"',
      '"0"',
      '"tester"',
      `"${createdAt.toISOString()}"`,
      `"${completedAt.toISOString()}"`,
    ].join(',');

    assert.equal(lines[1], expectedLine);

    server.close();
  } finally {
    (InventoryService as any).streamImportsForExport = origStreamExports;
  }
});

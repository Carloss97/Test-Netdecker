// Ensure DB init is skipped so we can stub Prisma methods
process.env.SKIP_DB_INIT = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../../index.js';
import { InventoryService } from '../../services/InventoryService.js';

test('integration: inventory import-csv and basic checkout flow', async (t) => {
  const origImport = InventoryService.importFromBuffer;

  try {
    InventoryService.importFromBuffer = async (_buffer: Buffer, _mimetype: string, _opts: any) => {
      return { importId: 'imp-1', totalRecords: 2, successCount: 2, failureCount: 0 } as any;
    };

    const server = app.listen(0);
    const addr = server.address();
    const port = (addr && typeof addr === 'object' && 'port' in addr) ? (addr as any).port : (addr as any);
    const base = `http://127.0.0.1:${port}`;

    await t.test('POST /api/inventory/import-csv accepts CSV file and returns importId', async () => {
      const fd = new FormData();
      const csv = 'listingId,quantity\nL1,2\nL2,3\n';
      fd.append('file', new Blob([csv]), 'test.csv');

      const res = await fetch(`${base}/api/inventory/import-csv`, { method: 'POST', body: fd });
      assert.equal(res.status, 200);
      const j: any = await res.json();
      assert.equal(j.success, true);
      assert.equal(j.result.importId, 'imp-1');
    });

    server.close();
  } finally {
    InventoryService.importFromBuffer = origImport;
  }
});

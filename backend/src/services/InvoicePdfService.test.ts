import test from 'node:test';
import assert from 'node:assert/strict';
import InvoicePdfService from './InvoicePdfService.js';
import prisma from '../utils/db.js';

test('renderPdf returns a PDF buffer', async () => {
  const invoice = { invoiceNumber: 'INV-TEST-1', date: new Date().toISOString(), orderId: 'o-1', total: 1234, currency: 'CLP' };
  const order = { id: 'o-1', items: [{ listingId: 'L1', quantity: 2, pricePerUnit: 100, subtotal: 200, description: 'Card A' }] };

  const buf = await InvoicePdfService.renderPdf({ invoice, order } as any);
  assert.ok(Buffer.isBuffer(buf));
  assert.ok(buf.length > 100);
});

test('generatePdfForInvoice throws when invoice not found', async () => {
  const origInvoice = (prisma as any).invoice;
  try {
    (prisma as any).invoice = { findUnique: async () => null };
    await assert.rejects(async () => {
      await InvoicePdfService.generatePdfForInvoice('nope');
    });
  } finally {
    (prisma as any).invoice = origInvoice;
  }
});

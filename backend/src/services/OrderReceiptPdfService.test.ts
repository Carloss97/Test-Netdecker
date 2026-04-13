import test from 'node:test';
import assert from 'node:assert/strict';
import OrderReceiptPdfService from './OrderReceiptPdfService.js';
import prisma from '../utils/db.js';

test('renderPdf returns buffer', async () => {
  const order = { id: 'o-1', orderNumber: 'ORD-1', createdAt: new Date().toISOString(), items: [{ listingId: 'L1', quantity: 1, pricePerUnit: 100, subtotal: 100 }], total: 100, currency: 'CLP' };
  const buf = await OrderReceiptPdfService.renderPdf({ order } as any);
  assert.ok(Buffer.isBuffer(buf));
  assert.ok(buf.length > 50);
});

test('generatePdfForOrder throws when order missing', async () => {
  const orig = (prisma as any).order;
  try {
    (prisma as any).order = { findUnique: async () => null };
    await assert.rejects(async () => { await OrderReceiptPdfService.generatePdfForOrder('nope'); });
  } finally {
    (prisma as any).order = orig;
  }
});
import test from 'node:test';
import assert from 'node:assert/strict';
import OrderReceiptPdfService from './OrderReceiptPdfService.js';
import prisma from '../utils/db.js';

process.env.SKIP_ORDER_RECEIPT_SAVE = 'true';

test('renderPdf returns a PDF buffer for an order', async () => {
  const order = { id: 'o-1', createdAt: new Date().toISOString(), items: [{ listingId: 'L1', quantity: 1, pricePerUnit: 100, subtotal: 100, description: 'Card A' }], total: 100, currency: 'CLP' };
  const buf = await OrderReceiptPdfService.renderPdf({ order } as any);
  assert.ok(Buffer.isBuffer(buf));
  assert.ok(buf.length > 100);
});

test('generatePdfForOrder throws when order not found', async () => {
  const origOrder = (prisma as any).order;
  try {
    (prisma as any).order = { findUnique: async () => null };
    await assert.rejects(async () => {
      await OrderReceiptPdfService.generatePdfForOrder('nope');
    });
  } finally {
    (prisma as any).order = origOrder;
  }
});

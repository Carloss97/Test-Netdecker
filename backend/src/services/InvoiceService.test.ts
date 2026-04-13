import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../utils/db.js';
import InvoiceService from './InvoiceService.js';

// Avoid writing PDFs during unit tests
process.env.SKIP_INVOICE_PDF_SAVE = 'true';

test('createInvoiceForOrder creates invoice record', async () => {
  const orig = prisma.$transaction;
  try {
    let created: any = null;
    const tx = {
      order: { findUnique: async ({ where }: any) => ({ id: where.id, storeId: 'S1', total: 1500, currency: 'CLP' }) },
      invoice: { create: async ({ data }: any) => { created = { id: 'inv-1', ...data }; return created; } }
    } as any;

    prisma.$transaction = (async (fn: any) => fn(tx)) as any;

    const inv: any = await InvoiceService.createInvoiceForOrder('o-1');
    assert.equal(inv.id, 'inv-1');
    assert.equal(inv.orderId, 'o-1');
    assert.equal(inv.total, 1500);
    assert.ok(inv.invoiceNumber && typeof inv.invoiceNumber === 'string');
  } finally {
    prisma.$transaction = orig;
  }
});

test('createInvoiceForOrder throws when order missing', async () => {
  const orig = prisma.$transaction;
  try {
    const tx = { order: { findUnique: async () => null } } as any;
    prisma.$transaction = (async (fn: any) => fn(tx)) as any;

    await assert.rejects(async () => {
      await InvoiceService.createInvoiceForOrder('nope');
    });
  } finally {
    prisma.$transaction = orig;
  }
});

import { firstRow } from './d1.js';

function genId(prefix = 'id') {
  return (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) || `${prefix}-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`;
}

function genInvoiceNumber() {
  return `INV-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`;
}

export async function createInvoiceForOrder(db, orderId) {
  if (!db) throw new Error('No DB binding available');
  const ordRes = await db.prepare('SELECT id, total FROM "order" WHERE id = ?').bind(orderId).all();
  const order = firstRow(ordRes);
  if (!order) throw new Error('Order not found');

  const id = genId('inv');
  const invoiceNumber = genInvoiceNumber();
  const now = new Date().toISOString();
  await db.prepare('INSERT INTO invoice (id, storeId, orderId, invoiceNumber, date, total, currency, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, null, orderId, invoiceNumber, now, Number(order.total || 0), 'CLP', now).run();
  const res = await db.prepare('SELECT id, storeId, orderId, invoiceNumber, date, total, currency, pdfUrl, createdAt FROM invoice WHERE id = ?').bind(id).all();
  return firstRow(res);
}

export default { createInvoiceForOrder };

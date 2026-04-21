import { firstRow } from './d1.js';

function genId(prefix = 'id') {
  return (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) || `${prefix}-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`;
}

function generateOrderNumber() {
  return `ORD-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`;
}

export async function getOrderById(db, id) {
  if (!db) return null;
  const ordRes = await db.prepare('SELECT id, storeId, orderNumber, customerEmail, status, subtotal, tax, total, notes, receiptUrl, createdAt, updatedAt FROM "order" WHERE id = ?').bind(id).all();
  const order = firstRow(ordRes);
  if (!order) return null;
  const itemsRes = await db.prepare('SELECT id, orderId, listingId, quantity, pricePerUnit, subtotal, createdAt FROM orderItem WHERE orderId = ?').bind(id).all();
  const items = Array.isArray(itemsRes?.results) ? itemsRes.results : (Array.isArray(itemsRes) ? itemsRes : []);
  order.items = items;
  return order;
}

export async function processPosSale(db, input) {
  if (!db) throw new Error('No DB binding available');
  const items = Array.isArray(input?.items) ? input.items : [];
  if (!items || items.length === 0) throw new Error('Cart items are required');

  // Idempotency: if externalReference provided, return existing order
  if (input.externalReference) {
    try {
      const ex = await db.prepare('SELECT id FROM "order" WHERE notes = ? LIMIT 1').bind(String(input.externalReference)).all();
      const found = firstRow(ex);
      if (found && found.id) {
        const existing = await getOrderById(db, found.id);
        if (existing) return existing;
      }
    } catch (_) {}
  }

  // Fetch listings in batch
  const listingIds = Array.from(new Set(items.map((it) => String(it.listingId))));
  if (listingIds.length === 0) throw new Error('No listingIds provided');

  const placeholders = listingIds.map(() => '?').join(',');
  const listingRes = await db.prepare(`SELECT id, finalPrice, quantity FROM listing WHERE id IN (${placeholders})`).bind(...listingIds).all();
  const listingRows = Array.isArray(listingRes?.results) ? listingRes.results : (Array.isArray(listingRes) ? listingRes : []);
  const listingMap = new Map(listingRows.map((r) => [r.id || r.ID || r.Id, r]));

  // If storeId provided, fetch per-store stock for validation and later decrement
  const storeId = input.storeId || null;
  let storeStockMap = new Map();
  if (storeId) {
    try {
      const stRes = await db.prepare(`SELECT listingId, id, quantity FROM listingStock WHERE listingId IN (${placeholders}) AND storeId = ?`).bind(...listingIds, storeId).all();
      const stRows = Array.isArray(stRes?.results) ? stRes.results : (Array.isArray(stRes) ? stRes : []);
      for (const r of stRows) storeStockMap.set(r.listingId || r.LISTINGID || r.listingId, { id: r.id || r.ID, quantity: Number(r.quantity || 0) });
    } catch (_) {
      storeStockMap = new Map();
    }
  }

  // Validate stock & compute totals
  let subtotal = 0;
  for (const it of items) {
    const lid = String(it.listingId);
    const listing = listingMap.get(lid);
    if (!listing) throw new Error(`Listing not found: ${lid}`);
    const qty = Number(it.quantity || 0);
    if (qty <= 0) throw new Error('Quantity must be > 0');
    const available = storeId ? (storeStockMap.get(lid)?.quantity || 0) : Number(listing.quantity || 0);
    if (available < qty) throw new Error(`Insufficient stock for listing ${lid}`);
    const unitPrice = Number(listing.finalPrice || 0);
    subtotal += unitPrice * qty;
  }

  const tax = 0;
  const total = subtotal + tax;
  const orderId = genId('ord');
  const orderNumber = generateOrderNumber();
  const now = new Date().toISOString();

  await db.prepare('INSERT INTO "order" (id, storeId, orderNumber, customerEmail, status, subtotal, tax, total, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(orderId, input.storeId || null, orderNumber, input.customerEmail || 'POS', 'CONFIRMED', subtotal, tax, total, input.externalReference || null, now, now)
    .run();

  // Create items, stock movements and update listings
  for (const it of items) {
    const lid = String(it.listingId);
    const qty = Number(it.quantity || 0);
    const listing = listingMap.get(lid);
    const unitPrice = Number(listing.finalPrice || 0);
    const subtotalItem = unitPrice * qty;
    const itemId = genId('oi');
    await db.prepare('INSERT INTO orderItem (id, cartId, orderId, listingId, quantity, pricePerUnit, subtotal, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(itemId, null, orderId, lid, qty, unitPrice, subtotalItem, now).run();

    // stock movement
    const smId = genId('sm');
    await db.prepare('INSERT INTO stockMovement (id, listingId, warehouseId, fromWarehouseId, toWarehouseId, quantity, type, reference, performedBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(smId, lid, storeId || null, storeId || null, null, qty, 'OUT', `pos:${orderId}`, input.performedBy || null, now).run();

    // decrement per-store stock when storeId provided, otherwise decrement global listing quantity
    if (storeId) {
      const storeRow = storeStockMap.get(lid);
      if (!storeRow) throw new Error(`No stock row for listing ${lid} at store ${storeId}`);
      const newStoreQty = Math.max(0, (Number(storeRow.quantity || 0) - qty));
      try {
        await db.prepare('UPDATE listingStock SET quantity = ?, updatedAt = ? WHERE id = ?').bind(newStoreQty, now, storeRow.id).run();
        // update in-memory map so subsequent items use updated value
        storeStockMap.set(lid, { id: storeRow.id, quantity: newStoreQty });
      } catch (err) {
        throw new Error(`Failed to update store stock for listing ${lid}: ${String(err)}`);
      }

      // recompute aggregated listing quantity across stores and update listing
      try {
        const sumRes = await db.prepare('SELECT SUM(quantity) as total FROM listingStock WHERE listingId = ?').bind(lid).all();
        const sumRow = Array.isArray(sumRes?.results) ? sumRes.results[0] : (Array.isArray(sumRes) ? sumRes[0] : null);
        const total = sumRow && sumRow.total ? Number(sumRow.total) : 0;
        try {
          await db.prepare('UPDATE listing SET quantity = ?, lastSyncedAt = ? WHERE id = ?').bind(total, now, lid).run();
        } catch (_) {}
      } catch (_) {}
    } else {
      try {
        await db.prepare('UPDATE listing SET quantity = quantity - ? WHERE id = ?').bind(qty, lid).run();
      } catch (_) {}
    }
  }

  // Return created order with items
  const created = await getOrderById(db, orderId);
  return created;
}

export default { processPosSale, getOrderById };

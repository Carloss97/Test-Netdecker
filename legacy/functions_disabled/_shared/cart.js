import { firstRow } from './d1.js';

function genId(prefix = 'id') {
  return (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) || `${prefix}-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`;
}

export async function getOrCreateCart(db, sessionId) {
  if (!db) throw new Error('No DB binding available');
  // try find existing cart
  const res = await db.prepare('SELECT id, sessionId, createdAt, updatedAt FROM cart WHERE sessionId = ? ORDER BY updatedAt DESC LIMIT 1').bind(sessionId).all();
  let cart = firstRow(res);
  const now = new Date().toISOString();
  if (!cart) {
    const id = genId('cart');
    await db.prepare('INSERT INTO cart (id, sessionId, createdAt, updatedAt) VALUES (?, ?, ?, ?)').bind(id, sessionId, now, now).run();
    cart = { id, sessionId, createdAt: now, updatedAt: now };
  }

  // fetch items for cart (orderId IS NULL)
  const itemsRes = await db.prepare('SELECT id, cartId, listingId, quantity, pricePerUnit, subtotal, createdAt FROM orderItem WHERE cartId = ? AND orderId IS NULL').bind(cart.id).all();
  const items = Array.isArray(itemsRes?.results) ? itemsRes.results : (Array.isArray(itemsRes) ? itemsRes : []);
  // enrich items with listing info when available
  const listingIds = Array.from(new Set(items.map((it) => it.listingId).filter(Boolean)));
  const listingMap = new Map();
  if (listingIds.length > 0) {
    const ph = listingIds.map(() => '?').join(',');
    const lres = await db.prepare(`SELECT id, finalPrice, quantity FROM listing WHERE id IN (${ph})`).bind(...listingIds).all();
    const lrows = Array.isArray(lres?.results) ? lres.results : (Array.isArray(lres) ? lres : []);
    for (const lr of lrows) listingMap.set(lr.id, lr);
  }

  const enriched = items.map((it) => ({ ...it, listing: listingMap.get(it.listingId) || null }));
  return { ...cart, items: enriched };
}

export async function addToCart(db, { sessionId, listingId, quantity }) {
  if (!db) throw new Error('No DB binding available');
  if (!listingId || !sessionId) throw new Error('sessionId and listingId required');
  const qty = Number(quantity || 0);
  if (qty <= 0) throw new Error('Quantity must be greater than 0');

  // fetch listing
  const lres = await db.prepare('SELECT id, finalPrice, quantity FROM listing WHERE id = ?').bind(listingId).all();
  const listing = firstRow(lres);
  if (!listing) throw new Error('Listing not found');

  const cart = await getOrCreateCart(db, sessionId);

  const existingRes = await db.prepare('SELECT id, quantity FROM orderItem WHERE cartId = ? AND listingId = ? AND orderId IS NULL LIMIT 1').bind(cart.id, listingId).all();
  const existing = firstRow(existingRes);
  const currentCartQty = existing?.quantity || 0;
  const desiredTotal = currentCartQty + qty;

  // compute reserved by others
  const reservedRes = await db.prepare('SELECT SUM(quantity) as reserved FROM orderItem WHERE listingId = ? AND orderId IS NULL AND cartId != ?').bind(listingId, cart.id).all();
  const reservedRow = firstRow(reservedRes);
  const reserved = Number(reservedRow?.reserved || 0);
  const available = Math.max(Number(listing.quantity || 0) - reserved, 0);
  if (available < desiredTotal) throw new Error(`Insufficient stock. Available: ${available}, requested: ${desiredTotal}`);

  const now = new Date().toISOString();
  if (existing) {
    await db.prepare('UPDATE orderItem SET quantity = ?, subtotal = ?, pricePerUnit = ? WHERE id = ?').bind(desiredTotal, desiredTotal * listing.finalPrice, listing.finalPrice, existing.id).run();
  } else {
    const id = genId('oi');
    await db.prepare('INSERT INTO orderItem (id, cartId, listingId, quantity, pricePerUnit, subtotal, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, cart.id, listingId, qty, listing.finalPrice, qty * listing.finalPrice, now).run();
  }

  // bump cart updatedAt
  await db.prepare('UPDATE cart SET updatedAt = ? WHERE id = ?').bind(now, cart.id).run();
  return getOrCreateCart(db, sessionId);
}

export async function removeFromCart(db, sessionId, itemId) {
  if (!db) throw new Error('No DB binding available');
  const cart = await getOrCreateCart(db, sessionId);
  await db.prepare('DELETE FROM orderItem WHERE id = ? AND cartId = ? AND orderId IS NULL').bind(itemId, cart.id).run();
  return getOrCreateCart(db, sessionId);
}

export async function updateItemQuantity(db, sessionId, itemId, quantity) {
  if (!db) throw new Error('No DB binding available');
  const qty = Number(quantity || 0);
  if (qty <= 0) return removeFromCart(db, sessionId, itemId);
  const cart = await getOrCreateCart(db, sessionId);
  const itemRes = await db.prepare('SELECT id, listingId, quantity FROM orderItem WHERE id = ? AND cartId = ? AND orderId IS NULL LIMIT 1').bind(itemId, cart.id).all();
  const item = firstRow(itemRes);
  if (!item) throw new Error('Cart item not found');

  // available for session excluding this item
  const reservedRes = await db.prepare('SELECT SUM(quantity) as reserved FROM orderItem WHERE listingId = ? AND orderId IS NULL AND id != ?').bind(item.listingId, itemId).all();
  const reserved = Number(firstRow(reservedRes)?.reserved || 0);
  const listingRes = await db.prepare('SELECT id, finalPrice, quantity FROM listing WHERE id = ?').bind(item.listingId).all();
  const listing = firstRow(listingRes);
  const available = Math.max(Number(listing.quantity || 0) - reserved, 0);
  if (available < qty) throw new Error(`Insufficient stock. Available: ${available}, requested: ${qty}`);

  await db.prepare('UPDATE orderItem SET quantity = ?, subtotal = ?, pricePerUnit = ? WHERE id = ?').bind(qty, qty * listing.finalPrice, listing.finalPrice, itemId).run();
  await db.prepare('UPDATE cart SET updatedAt = ? WHERE id = ?').bind(new Date().toISOString(), cart.id).run();
  return getOrCreateCart(db, sessionId);
}

export async function checkout(db, sessionId, customerEmail, shippingAddress, notes) {
  if (!db) throw new Error('No DB binding available');
  const cart = await getOrCreateCart(db, sessionId);
  if (!cart.items || cart.items.length === 0) throw new Error('Cart is empty');

  // verify stock
  for (const item of cart.items) {
    const listingRes = await db.prepare('SELECT id, quantity FROM listing WHERE id = ?').bind(item.listingId).all();
    const listing = firstRow(listingRes);
    if (!listing || Number(listing.quantity || 0) < Number(item.quantity || 0)) throw new Error(`Insufficient stock for listing ${item.listingId}`);
  }

  const subtotal = cart.items.reduce((s, it) => s + Number(it.subtotal || 0), 0);
  const tax = 0;
  const total = subtotal + tax;
  const orderId = genId('ord');
  const orderNumber = `ORD-${Date.now()}`;
  const now = new Date().toISOString();

  await db.prepare('INSERT INTO "order" (id, orderNumber, customerEmail, status, subtotal, tax, total, shippingAddress, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(orderId, orderNumber, customerEmail, 'PENDING', subtotal, tax, total, shippingAddress || null, notes || null, now, now).run();

  for (const item of cart.items) {
    try {
      await db.prepare('UPDATE listing SET quantity = quantity - ? WHERE id = ?').bind(Number(item.quantity || 0), item.listingId).run();
      await db.prepare('UPDATE orderItem SET orderId = ?, cartId = NULL WHERE id = ?').bind(orderId, item.id).run();
    } catch (_) {}
  }

  const createdRes = await db.prepare('SELECT id, orderNumber, customerEmail, status, subtotal, tax, total, shippingAddress, notes, createdAt, updatedAt FROM "order" WHERE id = ?').bind(orderId).all();
  const created = firstRow(createdRes);
  return created;
}

export default { getOrCreateCart, addToCart, removeFromCart, updateItemQuantity, checkout };

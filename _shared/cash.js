import { firstRow } from './d1.js';

function genId(prefix = 'id') {
  return (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) || `${prefix}-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`;
}

export async function openSession(db, params) {
  const { storeId = null, openedBy = null, startingCash = 0 } = params || {};
  if (typeof startingCash !== 'number' || Number.isNaN(startingCash) || startingCash < 0) throw new Error('Invalid startingCash');
  const id = genId('cs');
  const sessionId = genId('csess');
  const now = new Date().toISOString();
  await db.prepare('INSERT INTO cashSession (id, sessionId, storeId, openedBy, startingCash, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, sessionId, storeId, openedBy, Number(startingCash || 0), 'OPEN', now, now).run();
  const res = await db.prepare('SELECT id, sessionId, storeId, openedBy, closedBy, startingCash, endingCash, status, createdAt, closedAt, updatedAt FROM cashSession WHERE id = ?').bind(id).all();
  return firstRow(res);
}

export async function closeSession(db, sessionId, params) {
  if (!sessionId) throw new Error('sessionId required');
  const { closedBy = null, endingCash = null } = params || {};
  const now = new Date().toISOString();
  const existingRes = await db.prepare('SELECT id, sessionId, storeId, openedBy, createdAt FROM cashSession WHERE sessionId = ? LIMIT 1').bind(sessionId).all();
  const existing = firstRow(existingRes);
  if (!existing) throw new Error('CashSession not found');
  await db.prepare('UPDATE cashSession SET closedBy = ?, endingCash = ?, status = ?, closedAt = ?, updatedAt = ? WHERE sessionId = ?')
    .bind(closedBy, endingCash !== undefined ? Number(endingCash) : null, 'CLOSED', now, now, sessionId).run();

  // Try to compute a non-persistent snapshot (best-effort) — simplified: total of successful transactions for store/time window
  try {
    const whereSessions = [];
    // In a richer implementation we would compute session range; here we just return updated record
  } catch (_) {}

  const res = await db.prepare('SELECT id, sessionId, storeId, openedBy, closedBy, startingCash, endingCash, status, createdAt, closedAt, updatedAt FROM cashSession WHERE sessionId = ? LIMIT 1').bind(sessionId).all();
  return firstRow(res);
}

export async function getSessionById(db, sessionId) {
  if (!sessionId) throw new Error('sessionId required');
  const res = await db.prepare('SELECT id, sessionId, storeId, openedBy, closedBy, startingCash, endingCash, status, createdAt, closedAt, updatedAt FROM cashSession WHERE sessionId = ? LIMIT 1').bind(sessionId).all();
  const s = firstRow(res);
  if (!s) throw new Error('CashSession not found');
  return s;
}

export default { openSession, closeSession, getSessionById };

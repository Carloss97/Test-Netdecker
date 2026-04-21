import { firstRow } from './d1.js';

function genId(prefix = 'id') {
  return (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) || `${prefix}-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`;
}

export async function createSession(db, input) {
  const now = new Date().toISOString();
  const id = genId('ps');
  const sessionId = genId('pspub');
  const itemsValue = input.items != null ? JSON.stringify(input.items) : null;
  await db.prepare('INSERT INTO pOSSession (id, sessionId, storeId, userId, items, subtotal, tax, total, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, sessionId, input.storeId || null, input.userId || null, itemsValue, Number(input.subtotal || 0), Number(input.tax || 0), Number(input.total || 0), input.status || null, now, now).run();
  const res = await db.prepare('SELECT id, sessionId, storeId, userId, items, subtotal, tax, total, status, createdAt, updatedAt FROM pOSSession WHERE id = ?').bind(id).all();
  const session = firstRow(res);
  if (session && typeof session.items === 'string') {
    try { session.items = JSON.parse(session.items); } catch (_) {}
  }
  return session;
}

export async function getSessionByPublicId(db, sessionPublicId) {
  const res = await db.prepare('SELECT id, sessionId, storeId, userId, items, subtotal, tax, total, status, createdAt, updatedAt FROM pOSSession WHERE sessionId = ? LIMIT 1').bind(sessionPublicId).all();
  const sess = firstRow(res);
  if (!sess) return null;
  if (typeof sess.items === 'string') {
    try { sess.items = JSON.parse(sess.items); } catch (_) {}
  }
  const txsRes = await db.prepare('SELECT id, sessionId, method, amount, status, processorResponse, processorReference, createdAt, updatedAt FROM paymentTransaction WHERE sessionId = ? ORDER BY createdAt ASC').bind(sess.id).all();
  const txs = Array.isArray(txsRes?.results) ? txsRes.results : (Array.isArray(txsRes) ? txsRes : []);
  sess.transactions = txs;
  return sess;
}

export async function createTransaction(db, sessionPublicId, input) {
  // find session id
  const sres = await db.prepare('SELECT id FROM pOSSession WHERE sessionId = ? LIMIT 1').bind(sessionPublicId).all();
  const session = firstRow(sres);
  if (!session || !session.id) throw new Error('POS session not found');
  const now = new Date().toISOString();
  const id = genId('pt');
  await db.prepare('INSERT INTO paymentTransaction (id, sessionId, method, amount, status, processorResponse, processorReference, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, session.id, input.method || 'OTHER', Number(input.amount || 0), input.status || null, input.processorResponse ? JSON.stringify(input.processorResponse) : null, input.processorReference || null, now, now).run();
  const tres = await db.prepare('SELECT id, sessionId, method, amount, status, processorResponse, processorReference, createdAt, updatedAt FROM paymentTransaction WHERE id = ?').bind(id).all();
  return firstRow(tres);
}

export async function listTransactions(db, sessionPublicId) {
  const sres = await db.prepare('SELECT id FROM pOSSession WHERE sessionId = ? LIMIT 1').bind(sessionPublicId).all();
  const session = firstRow(sres);
  if (!session || !session.id) return [];
  const txsRes = await db.prepare('SELECT id, sessionId, method, amount, status, processorResponse, processorReference, createdAt, updatedAt FROM paymentTransaction WHERE sessionId = ? ORDER BY createdAt ASC').bind(session.id).all();
  return Array.isArray(txsRes?.results) ? txsRes.results : (Array.isArray(txsRes) ? txsRes : []);
}

export default { createSession, getSessionByPublicId, createTransaction, listTransactions };

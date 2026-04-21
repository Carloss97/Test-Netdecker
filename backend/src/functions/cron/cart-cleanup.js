import { pickDb, ensureSchema } from '../../_shared/d1.js';

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function runCartCleanup(db, expiryMinutes, env = {}) {
  if (!db) throw new Error('No DB binding');
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS cart (
      id TEXT PRIMARY KEY,
      storeId TEXT,
      sessionId TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );`).run();
    await db.prepare(`CREATE TABLE IF NOT EXISTS orderItem (
      id TEXT PRIMARY KEY,
      cartId TEXT,
      orderId TEXT,
      listingId TEXT,
      quantity INTEGER,
      createdAt TEXT
    );`).run();
  } catch (_) {}

  const minutes = Number(expiryMinutes ?? Number(env.CART_EXPIRY_MINUTES ?? '60'));
  const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();

  const res = await db.prepare('SELECT id, sessionId, updatedAt FROM cart WHERE updatedAt < ?').bind(cutoff).all();
  const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);
  if (!rows.length) return { deletedItems: 0, deletedCarts: 0 };

  let totalDeletedItems = 0;
  let totalDeletedCarts = 0;

  for (const r of rows) {
    try {
      const del = await db.prepare('DELETE FROM orderItem WHERE cartId = ? AND orderId IS NULL').bind(r.id).run();
      if (del && typeof del.changes === 'number') totalDeletedItems += del.changes;
      totalDeletedCarts++;
      await db.prepare('DELETE FROM cart WHERE id = ?').bind(r.id).run();
    } catch (e) {}
  }

  return { deletedItems: totalDeletedItems, deletedCarts: totalDeletedCarts };
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = pickDb(env);
  if (!db) return json({ success: false, error: 'No DB binding' }, 500);
  if (db) await ensureSchema(db);

  const url = new URL(request.url);
  const qp = url.searchParams.get('expiryMinutes');
  const body = (request.json && (await request.json().catch(() => ({})))) || {};
  const expiry = body.expiryMinutes ?? qp ?? undefined;

  try {
    const result = await runCartCleanup(db, expiry, env);
    return json({ success: true, ...result });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default onRequest;

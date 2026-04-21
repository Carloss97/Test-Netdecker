import { pickDb, ensureSchema } from '../../_shared/d1.js';

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function runReservationCleanup(db, env = {}) {
  if (!db) throw new Error('No DB binding');

  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS reservation (
      id TEXT PRIMARY KEY,
      listingId TEXT,
      warehouseId TEXT,
      status TEXT,
      expiresAt TEXT,
      createdAt TEXT
    );`).run();

    await db.prepare(`CREATE TABLE IF NOT EXISTS stockMovement (
      id TEXT PRIMARY KEY,
      listingId TEXT,
      warehouseId TEXT,
      quantity INTEGER,
      type TEXT,
      reference TEXT,
      performedBy TEXT,
      notes TEXT,
      createdAt TEXT
    );`).run();
  } catch (_) {}

  const now = new Date().toISOString();
  const res = await db.prepare('SELECT id, listingId, warehouseId FROM reservation WHERE status = ? AND expiresAt <= ?').bind('ACTIVE', now).all();
  const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);
  if (!rows.length) return { processed: 0 };

  let processed = 0;
  for (const r of rows) {
    try {
      const ref = `reservation:${r.id}`;
      const movementsRes = await db.prepare('SELECT id, listingId, warehouseId, quantity, type FROM stockMovement WHERE reference = ?').bind(ref).all();
      const movements = Array.isArray(movementsRes?.results) ? movementsRes.results : (Array.isArray(movementsRes) ? movementsRes : []);
      const outQty = (movements || []).filter((m) => String(m.type).toUpperCase() === 'OUT').reduce((s, m) => s + (Number(m.quantity) || 0), 0);
      if (outQty > 0) {
        const id = `sm-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        const createdAt = new Date().toISOString();
        await db.prepare('INSERT INTO stockMovement (id, listingId, warehouseId, quantity, type, reference, performedBy, notes, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(id, r.listingId || null, r.warehouseId || null, outQty, 'IN', `${ref}:revert`, 'system', 'Revert expired reservation', createdAt).run().catch(() => {});
        await db.prepare('UPDATE listing SET quantity = quantity + ? WHERE id = ?').bind(outQty, r.listingId).run().catch(() => {});
      }

      await db.prepare('UPDATE reservation SET status = ? WHERE id = ?').bind('EXPIRED', r.id).run();
      processed++;
    } catch (err) {}
  }

  return { processed };
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = pickDb(env);
  if (!db) return json({ success: false, error: 'No DB binding' }, 500);
  if (db) await ensureSchema(db);

  try {
    const result = await runReservationCleanup(db, env);
    return json({ success: true, ...result });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default onRequest;

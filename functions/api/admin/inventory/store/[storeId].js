import { pickDb, ensureSchema, buildSelectColumns, aliasSelectColumn } from '../../../../_shared/d1.js';
import { validateToken } from '../../../../_shared/adminAuth.js';

function extractToken(request) {
  const auth = request.headers.get('authorization') || '';
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return request.headers.get('x-admin-token') || '';
}

export async function onRequest(context) {
  const { request, env, params } = context;
  try {
    const { storeId } = params || {};
    if (!storeId) return new Response(JSON.stringify({ success: false, error: 'storeId missing' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    // simple auth: require admin token
    const token = extractToken(request);
    const user = await validateToken(env, token);
    if (!user) return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

    // If session is scoped to a store and user is not global admin, restrict access
    if (user.storeId && user.role !== 'ADMIN' && String(user.storeId) !== String(storeId)) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'GET') {
      // Return listingStock rows with joined listing/card metadata
      const listingCols = await buildSelectColumns(db, 'listing', 'l', ['id','cardId','referencePrice','marginMultiplier','finalPrice','quantity','status']);
      const cardCols = await buildSelectColumns(db, 'card', 'c', ['externalId','cardName','rarity']);
      let listingSelect = listingCols;
      listingSelect = aliasSelectColumn(listingSelect, 'l', 'id', 'listingId');
      const selectParts = [];
      if (listingSelect) selectParts.push(listingSelect);
      if (cardCols) selectParts.push(cardCols);
      const sql = `SELECT ls.id as stockId, ls.storeId, ls.listingId, ls.quantity as storeQuantity, ${selectParts.join(', ')} FROM listingStock ls LEFT JOIN listing l ON ls.listingId = l.id LEFT JOIN card c ON l.cardId = c.id WHERE ls.storeId = ?`;
      const res = await db.prepare(sql).bind(storeId).all();
      const rows = Array.isArray(res.results) ? res.results : (Array.isArray(res) ? res : []);
      return new Response(JSON.stringify({ success: true, storeId, results: rows }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const listingId = body.listingId || body.listing || null;
      const quantity = typeof body.quantity === 'number' ? Math.max(0, Math.floor(body.quantity)) : null;
      if (!listingId || quantity === null) return new Response(JSON.stringify({ success: false, error: 'listingId and quantity required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

      // upsert listingStock
      const curRes = await db.prepare('SELECT id FROM listingStock WHERE listingId = ? AND storeId = ?').bind(listingId, storeId).all();
      const curRow = Array.isArray(curRes.results) ? curRes.results[0] : (Array.isArray(curRes) ? curRes[0] : null);
      const now = new Date().toISOString();
      if (curRow) {
        await db.prepare('UPDATE listingStock SET quantity = ?, updatedAt = ? WHERE id = ?').bind(quantity, now, curRow.id).run();
      } else {
        const sid = (globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID() : `ls-${Date.now()}-${Math.floor(Math.random()*10000)}`;
        await db.prepare('INSERT INTO listingStock (id, storeId, listingId, quantity, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)').bind(sid, storeId, listingId, quantity, now, now).run();
      }

      // recompute aggregate
      const aggRes = await db.prepare('SELECT SUM(quantity) as total FROM listingStock WHERE listingId = ?').bind(listingId).all();
      const aggRow = Array.isArray(aggRes.results) ? aggRes.results[0] : (Array.isArray(aggRes) ? aggRes[0] : null);
      const total = aggRow ? (Number(aggRow.total) || 0) : 0;
      await db.prepare('UPDATE listing SET quantity = ?, updatedAt = ? WHERE id = ?').bind(total, now, listingId).run();

      return new Response(JSON.stringify({ success: true, listingId, storeId, storeQuantity: quantity, quantity: total }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: false, error: 'method_not_allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export default onRequest;


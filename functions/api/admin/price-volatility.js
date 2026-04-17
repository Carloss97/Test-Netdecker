import { pickDb, ensureSchema } from '../../_shared/d1.js';
import { validateToken } from '../../_shared/adminAuth.js';

function extractToken(request) {
  const auth = request.headers.get('authorization') || '';
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return request.headers.get('x-admin-token') || '';
}

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const token = String(extractToken(request) || '');
    if (!token) return json({ success: false, error: 'Missing token' }, 401);
    const user = await validateToken(env, token);
    if (!user) return json({ success: false, error: 'Invalid token' }, 401);

    const url = new URL(request.url);
    const limit = Math.min(parseInt(String(url.searchParams.get('limit') || '20'), 10) || 20, 100);
    const windowParam = String(url.searchParams.get('window') || '7d').toLowerCase();
    const windowMsByKey = { '24h': 24 * 60 * 60 * 1000, '7d': 7 * 24 * 60 * 60 * 1000, '30d': 30 * 24 * 60 * 60 * 1000, '90d': 90 * 24 * 60 * 60 * 1000 };
    const windowMs = windowMsByKey[windowParam] || windowMsByKey['7d'];
    const fromIso = new Date(Date.now() - windowMs).toISOString();

    const db = pickDb(env);
    if (db) await ensureSchema(db);

    if (!db) return json({ success: false, error: 'No DB configured' }, 500);

    const sel = await db.prepare(`SELECT p.id, p.listingId, p.oldPrice, p.newPrice, p.percentChange, p.createdAt,
      c.cardName AS cardName, c.cardCode AS cardCode, e.editionCode AS editionCode, e.editionName AS editionName
      FROM priceHistory p
      LEFT JOIN listing l ON l.id = p.listingId
      LEFT JOIN card c ON c.id = l.cardId
      LEFT JOIN edition e ON e.editionCode = l.editionCode
      WHERE p.reason = 'VOLATILE_ALERT' AND p.createdAt >= ?
      ORDER BY p.createdAt DESC LIMIT ?`).bind(fromIso, limit).all();

    const rows = Array.isArray(sel?.results) ? sel.results : (Array.isArray(sel) ? sel : []);

    return json({ success: true, window: windowParam, from: fromIso, total: rows.length, events: rows.map((h) => ({
      priceHistoryId: h.id,
      listingId: h.listingId,
      cardName: h.cardName,
      editionCode: h.editionCode,
      oldPrice: h.oldPrice,
      newPrice: h.newPrice,
      percentChange: h.percentChange,
      createdAt: h.createdAt,
    })) });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default { onRequest };
import { pickDb, ensureSchema, buildSelectColumns } from '../../_shared/d1.js';

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const url = new URL(request.url);
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
    const windowParam = url.searchParams.get('window') || null;

    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: true, total: 0, events: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    const params = [];
    let where = '';
    if (windowParam) {
      const map = { '24h': 24 * 60 * 60 * 1000, '7d': 7 * 24 * 60 * 60 * 1000, '30d': 30 * 24 * 60 * 60 * 1000, '90d': 90 * 24 * 60 * 60 * 1000 };
      const ms = map[windowParam] || map['7d'];
      const cutoff = new Date(Date.now() - ms).toISOString();
      where = 'WHERE ph.createdAt >= ?';
      params.push(cutoff);
    }

    params.push(limit);

    // Build safe SELECT fragments so older D1 schemas don't cause runtime errors
    const phCols = await buildSelectColumns(db, 'priceHistory', 'ph', ['id','listingId','oldPrice','newPrice','oldReferencePrice','newReferencePrice','percentChange','createdAt']);
    const listingCols = await buildSelectColumns(db, 'listing', 'l', ['cardId','editionCode']);
    const cardCols = await buildSelectColumns(db, 'card', 'c', ['cardName']);
    const selectParts = [phCols, listingCols, cardCols];

    const sql = `SELECT ${selectParts.join(', ')} FROM priceHistory ph LEFT JOIN listing l ON l.id = ph.listingId LEFT JOIN card c ON c.id = l.cardId ${where} ORDER BY createdAt DESC LIMIT ?`;
    const res = await db.prepare(sql).bind(...params).all();

    const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);
    const events = rows.map((r) => ({
      priceHistoryId: r.id || r.ID || r.Id,
      listingId: r.listingId || null,
      cardName: r.cardName || null,
      editionCode: r.editionCode || null,
      percentChange: typeof r.percentChange === 'number' ? r.percentChange : (r.percentChange ? Number(r.percentChange) : null),
      oldPrice: r.oldReferencePrice ?? r.oldPrice ?? null,
      newPrice: r.newReferencePrice ?? r.newPrice ?? null,
      createdAt: r.createdAt || null,
    }));

    return new Response(JSON.stringify({ success: true, total: events.length, events }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

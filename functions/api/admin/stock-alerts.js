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
    const threshold = parseInt(String(url.searchParams.get('threshold') || '5'), 10) || 5;

    const db = pickDb(env);
    if (db) await ensureSchema(db);

    if (!db) return json({ success: false, error: 'No DB configured' }, 500);

    const rowsRes = await db.prepare(`SELECT l.id as listingId, l.quantity, l.condition, l.finalPrice, c.cardName, c.cardCode, c.imageUrl, e.editionCode, e.editionName
      FROM listing l
      LEFT JOIN card c ON c.id = l.cardId
      LEFT JOIN edition e ON e.editionCode = l.editionCode
      WHERE l.status IN ('active','manual') AND l.everHadStock = 1 AND l.quantity <= ?
      ORDER BY l.quantity ASC LIMIT 100`).bind(threshold).all();

    const rows = Array.isArray(rowsRes?.results) ? rowsRes.results : (Array.isArray(rowsRes) ? rowsRes : []);

    return json({ success: true, threshold, total: rows.length, alerts: rows.map((a) => ({
      listingId: a.listingId,
      cardName: a.cardName,
      cardCode: a.cardCode,
      editionCode: a.editionCode,
      editionName: a.editionName,
      condition: a.condition,
      quantity: a.quantity,
      finalPrice: a.finalPrice,
      imageUrl: a.imageUrl,
    })) });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default { onRequest };
import { pickDb, ensureSchema, buildSelectColumns, aliasSelectColumn } from '../../_shared/d1.js';

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const url = new URL(request.url);
    const threshold = Number.isFinite(Number(url.searchParams.get('threshold'))) ? Number(url.searchParams.get('threshold')) : 2;

    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ alerts: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    const cardCols = await buildSelectColumns(db, 'card', 'c', ['cardName']);
    const listingCols = await buildSelectColumns(db, 'listing', 'l', ['id','quantity','referencePrice','editionCode']);
    let listingSelect = listingCols || '';
    listingSelect = aliasSelectColumn(listingSelect, 'l', 'id', 'listingId');
    listingSelect = aliasSelectColumn(listingSelect, 'l', 'editionCode', 'editionCode');
    const selectCard = cardCols || 'c.cardName AS cardName';
    const sql = `SELECT ${listingSelect}, ${selectCard} FROM listing l LEFT JOIN card c ON c.id = l.cardId WHERE COALESCE(quantity,0) <= ? ORDER BY COALESCE(quantity,0) ASC LIMIT 200;`;
    const res = await db.prepare(sql).bind(threshold).all();
    const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);
    const alerts = rows.map((r) => ({ listingId: r.listingId, quantity: r.quantity || 0, cardName: r.cardName || 'Unknown', editionCode: r.editionCode || null, finalPrice: Math.round((r.referencePrice || 0) * 100) / 100 }));

    return new Response(JSON.stringify({ alerts }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ alerts: [] , error: String(err)}), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

import { pickDb, ensureSchema } from '../../../../_shared/d1.js';

function parseQuery(url) {
  const q = new URL(url).searchParams;
  return { listingId: q.get('listingId') || undefined, from: q.get('from') ? new Date(String(q.get('from'))) : undefined, to: q.get('to') ? new Date(String(q.get('to'))) : undefined };
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const db = pickDb(env);
    if (!db) return new Response('No DB binding available', { status: 500 });
    await ensureSchema(db);

    const q = parseQuery(request.url);
    const where = [];
    const binds = [];
    if (q.listingId) { where.push('listingId = ?'); binds.push(q.listingId); }
    if (q.from) { where.push('createdAt >= ?'); binds.push(q.from.toISOString()); }
    if (q.to) { where.push('createdAt <= ?'); binds.push(q.to.toISOString()); }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const rowsRes = await db.prepare(`SELECT id, listingId, oldPrice, newPrice, oldReferencePrice, newReferencePrice, oldExchangeRate, newExchangeRate, percentChange, reason, changedBy, notes, createdAt FROM priceHistory ${whereSql} ORDER BY createdAt DESC`).bind(...binds).all();
    const rows = Array.isArray(rowsRes?.results) ? rowsRes.results : (Array.isArray(rowsRes) ? rowsRes : []);

    const header = ['id', 'listingId', 'oldPrice', 'newPrice', 'oldReferencePrice', 'newReferencePrice', 'oldExchangeRate', 'newExchangeRate', 'percentChange', 'reason', 'changedBy', 'notes', 'createdAt'];
    const quote = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [header.join(',')].concat(rows.map((r) => header.map((h) => quote(r[h])).join(','))).join('\r\n');

    return new Response(csv, { status: 200, headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="price-history.csv"' } });
  } catch (err) {
    return new Response(String(err), { status: 500 });
  }
}

export default onRequest;

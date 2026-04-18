import { pickDb, ensureSchema } from '../../../../_shared/d1.js';

function parseImportQuery(url) {
  const q = new URL(url).searchParams;
  const status = q.get('status') || undefined;
  const dateFrom = q.get('dateFrom') ? new Date(String(q.get('dateFrom'))) : undefined;
  const dateTo = q.get('dateTo') ? new Date(String(q.get('dateTo'))) : undefined;
  return { status, dateFrom, dateTo };
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const db = pickDb(env);
    if (!db) return new Response('No DB binding available', { status: 500 });
    await ensureSchema(db);

    const q = parseImportQuery(request.url);
    const whereParts = [];
    const binds = [];
    if (q.status) { whereParts.push('status = ?'); binds.push(q.status); }
    if (q.dateFrom) { whereParts.push('createdAt >= ?'); binds.push(q.dateFrom.toISOString()); }
    if (q.dateTo) { whereParts.push('createdAt <= ?'); binds.push(q.dateTo.toISOString()); }
    const whereSql = whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : '';

    const rowsRes = await db.prepare(`SELECT id, fileName, status, totalRecords, successCount, failureCount, importedBy, createdAt, completedAt FROM inventoryImport ${whereSql} ORDER BY createdAt DESC`).bind(...binds).all();
    const items = Array.isArray(rowsRes?.results) ? rowsRes.results : (Array.isArray(rowsRes) ? rowsRes : []);

    const header = ['id', 'fileName', 'status', 'totalRecords', 'successCount', 'failureCount', 'importedBy', 'createdAt', 'completedAt'];
    const quote = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [header.join(',')].concat(items.map((it) => header.map((h) => quote(it[h])).join(','))).join('\r\n');

    return new Response(csv, { status: 200, headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="inventory-import-history.csv"' } });
  } catch (err) {
    return new Response(String(err), { status: 500 });
  }
}

export default onRequest;

import { pickDb, ensureSchema } from '../../../../_shared/d1.js';

function parseImportQuery(url) {
  const q = new URL(url).searchParams;
  const page = Number(q.get('page') || 1);
  const pageSize = Number(q.get('pageSize') || q.get('limit') || 20);
  const status = q.get('status') || undefined;
  const dateFrom = q.get('dateFrom') ? new Date(String(q.get('dateFrom'))) : undefined;
  const dateTo = q.get('dateTo') ? new Date(String(q.get('dateTo'))) : undefined;
  const sortBy = ['createdAt', 'status', 'fileName', 'totalRecords'].includes(String(q.get('sortBy') || 'createdAt')) ? String(q.get('sortBy') || 'createdAt') : 'createdAt';
  const sortDir = String(q.get('sortDir') || 'desc') === 'asc' ? 'asc' : 'desc';
  return { page, pageSize, status, dateFrom, dateTo, sortBy, sortDir };
}

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const db = pickDb(env);
    if (!db) return json({ success: false, error: 'No DB binding available' }, 500);
    await ensureSchema(db);

    const q = parseImportQuery(request.url);
    const whereParts = [];
    const binds = [];
    if (q.status) { whereParts.push('status = ?'); binds.push(q.status); }
    if (q.dateFrom) { whereParts.push('createdAt >= ?'); binds.push(q.dateFrom.toISOString()); }
    if (q.dateTo) { whereParts.push('createdAt <= ?'); binds.push(q.dateTo.toISOString()); }

    const whereSql = whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : '';
    const countRes = await db.prepare(`SELECT COUNT(*) AS total FROM inventoryImport ${whereSql}`).bind(...binds).all();
    const countRow = Array.isArray(countRes?.results) ? countRes.results[0] : (Array.isArray(countRes) ? countRes[0] : null);
    const total = countRow ? (countRow.total || Number(Object.values(countRow)[0]) || 0) : 0;

    const offset = (Math.max(1, q.page) - 1) * q.pageSize;
    const sql = `SELECT id, fileName, status, totalRecords, successCount, failureCount, createdAt, completedAt FROM inventoryImport ${whereSql} ORDER BY ${q.sortBy} ${q.sortDir} LIMIT ? OFFSET ?`;
    const rowsRes = await db.prepare(sql).bind(...binds, q.pageSize, offset).all();
    const items = Array.isArray(rowsRes?.results) ? rowsRes.results : (Array.isArray(rowsRes) ? rowsRes : []);

    return json({ success: true, items, page: q.page, pageSize: q.pageSize, total: Number(total) });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default onRequest;

import { pickDb, ensureSchema, buildSelectColumns, aliasSelectColumn } from '../../../_shared/d1.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  try {
    const { id } = params || {};
    if (!id) return new Response(JSON.stringify({ success: false, error: 'id missing' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const body = await request.json().catch(() => ({}));
    const status = body.status || null;
    // Support frontend op/value semantics: { op: 'set'|'inc'|'dec', value: number }
    const op = body.op || null;
    const value = typeof body.value === 'number' ? Number(body.value) : null;

    if (!op && value === null && status === null) return new Response(JSON.stringify({ success: false, error: 'nothing to update' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);


    // determine new quantity when op provided
    let newQuantity = null;
    if (op) {
      const curCols = await buildSelectColumns(db, 'listing', 'l', ['quantity']);
      const curRes = await db.prepare(`SELECT ${curCols} FROM listing l WHERE l.id = ?`).bind(id).all();
      const curRow = Array.isArray(curRes.results) ? curRes.results[0] : (Array.isArray(curRes) ? curRes[0] : null);
      const curQty = curRow ? (Number(curRow.quantity) || 0) : 0;
      if (op === 'set') {
        if (value === null) return new Response(JSON.stringify({ success: false, error: 'value required for set' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        newQuantity = value;
      } else if (op === 'inc') {
        newQuantity = curQty + (value || 1);
      } else if (op === 'dec') {
        newQuantity = Math.max(0, curQty - (value || 1));
      } else {
        return new Response(JSON.stringify({ success: false, error: 'unknown op' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
    }

    const binds = [];
    let sql = 'UPDATE listing SET ';
    const parts = [];
    if (newQuantity !== null) { parts.push('quantity = ?'); binds.push(newQuantity); }
    if (status !== null) { parts.push('status = ?'); binds.push(status); }
    parts.push('lastSyncedAt = ?'); binds.push(new Date().toISOString());
    sql += parts.join(', ') + ' WHERE id = ?'; binds.push(id);

    await db.prepare(sql).bind(...binds).run();

    const listingCols = await buildSelectColumns(db, 'listing', 'l', ['id','quantity','status']);
    let listingSelect = listingCols;
    listingSelect = aliasSelectColumn(listingSelect, 'l', 'id', 'listingId');
    const res = await db.prepare(`SELECT ${listingSelect} FROM listing l WHERE l.id = ?`).bind(id).all();
    const row = Array.isArray(res.results) ? res.results[0] : (Array.isArray(res) ? res[0] : null);
    return new Response(JSON.stringify({ success: true, listing: row }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export default onRequest;


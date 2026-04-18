import { pickDb, ensureSchema } from '../../../_shared/d1.js';

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { params, env } = context;
  try {
    const importId = params && (params.importId || params.id) ? String(params.importId || params.id) : '';
    if (!importId) return json({ success: false, error: 'importId missing' }, 400);

    const db = pickDb(env);
    if (!db) return json({ success: false, error: 'No DB binding available' }, 500);
    await ensureSchema(db);

    const res = await db.prepare('SELECT * FROM inventoryImport WHERE id = ?').bind(importId).all();
    const row = Array.isArray(res?.results) ? res.results[0] : (Array.isArray(res) ? res[0] : null);
    if (!row) return json({ success: false, error: 'Import not found' }, 404);
    return json({ success: true, item: row });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default onRequest;

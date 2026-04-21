import { pickDb, ensureSchema } from '../../_shared/d1.js';

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env, params } = context;
  try {
    const id = params && (params.id || params.tcgId) ? String(params.id || params.tcgId) : null;
    if (!id) return json({ success: false, error: 'id required' }, 400);

    const db = pickDb(env);
    if (db) await ensureSchema(db);

    // Try to read tCG record
    let tcgRecord = null;
    if (db) {
      try {
        const res = await db.prepare('SELECT id, name, displayName, description FROM tCG WHERE id = ? OR name = ? LIMIT 1').bind(id, id).all();
        const row = Array.isArray(res?.results) ? res.results[0] : (Array.isArray(res) ? res[0] : null);
        if (row) tcgRecord = { id: row.id, name: row.name || row.id, displayName: row.displayName || row.name || row.id, description: row.description || null };
      } catch (_) { tcgRecord = null; }
    }

    // Fallback to basic info when tCG table absent
    if (!tcgRecord) {
      const display = String(id || '').toUpperCase();
      tcgRecord = { id: display, name: display, displayName: display, description: null };
    }

    // Attach editions
    let editions = [];
    if (db) {
      try {
        const res = await db.prepare('SELECT id, editionCode, editionName, releaseDate, isActive FROM edition WHERE tcg = ? ORDER BY releaseDate DESC').bind(tcgRecord.name).all();
        editions = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);
      } catch (_) { editions = []; }
    }

    tcgRecord.editions = editions.map((r) => ({ id: r.id, editionCode: r.editionCode, editionName: r.editionName, releaseDate: r.releaseDate, isActive: !!r.isActive }));
    return json({ success: true, tcg: tcgRecord });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default onRequest;

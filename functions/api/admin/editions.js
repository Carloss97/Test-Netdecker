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

    const db = pickDb(env);
    if (db) await ensureSchema(db);
    if (!db) return json({ success: false, error: 'No DB configured' }, 500);

    const sel = await db.prepare(`SELECT e.id, e.tcg, e.editionCode, e.editionName, e.releaseDate, e.isActive,
      (SELECT COUNT(1) FROM card c WHERE c.tcg = e.tcg AND c.editionCode = e.editionCode) AS cardCount,
      (SELECT COUNT(1) FROM listing l WHERE l.editionCode = e.editionCode) AS listingCount
      FROM edition e
      ORDER BY e.tcg ASC, e.editionName ASC`).all();

    const rows = Array.isArray(sel?.results) ? sel.results : (Array.isArray(sel) ? sel : []);
    const editions = rows.map((e) => ({
      id: e.id,
      tcg: e.tcg,
      tcgDisplayName: null,
      editionCode: e.editionCode,
      editionName: e.editionName,
      releaseDate: e.releaseDate,
      isActive: !!e.isActive,
      cardCount: Number(e.cardCount || 0),
      listingCount: Number(e.listingCount || 0),
    }));

    return json({ success: true, total: editions.length, editions });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default { onRequest };

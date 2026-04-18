import { pickDb, ensureSchema } from '../../_shared/d1.js';

const DEFAULT_TCGS = [
  { id: 'MAGIC', name: 'MAGIC', displayName: 'Magic: The Gathering' },
  { id: 'POKEMON', name: 'POKEMON', displayName: 'Pokémon Trading Card Game' },
  { id: 'YUGIOH', name: 'YUGIOH', displayName: 'Yu-Gi-Oh!' },
  { id: 'ONE_PIECE', name: 'ONE_PIECE', displayName: 'One Piece TCG' },
  { id: 'DIGIMON', name: 'DIGIMON', displayName: 'Digimon Card Game' },
  { id: 'WEISS_SCHWARZ', name: 'WEISS_SCHWARZ', displayName: 'Weiss Schwarz' },
];

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const db = pickDb(env);
    if (db) await ensureSchema(db);

    // Try to read tCG table if available
    let tcgs = [];
    if (db) {
      try {
        const res = await db.prepare('SELECT id, name, displayName FROM tCG ORDER BY displayName ASC').all();
        const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);
        if (rows && rows.length > 0) {
          tcgs = rows.map((r) => ({ id: r.id || r.ID, name: r.name, displayName: r.displayName || r.name }));
        }
      } catch (_) { tcgs = []; }
    }

    if (!tcgs || tcgs.length === 0) tcgs = DEFAULT_TCGS;

    // Attach editions from edition table when available
    if (db) {
      for (const t of tcgs) {
        try {
          const res = await db.prepare('SELECT id, editionCode, editionName, releaseDate, isActive FROM edition WHERE tcg = ? ORDER BY releaseDate DESC').bind(t.id).all();
          const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);
          t.editions = rows.map((r) => ({ id: r.id, editionCode: r.editionCode, editionName: r.editionName, releaseDate: r.releaseDate, isActive: !!r.isActive }));
        } catch (_) { t.editions = []; }
      }
    }

    return json({ success: true, total: tcgs.length, tcgs });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default onRequest;

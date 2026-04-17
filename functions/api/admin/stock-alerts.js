import { pickDb, ensureSchema } from '../../_shared/d1.js';

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const url = new URL(request.url);
    const threshold = Number.isFinite(Number(url.searchParams.get('threshold'))) ? Number(url.searchParams.get('threshold')) : 2;

    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ alerts: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    const res = await db.prepare('SELECT l.id AS listingId, l.quantity AS quantity, l.referencePrice AS referencePrice, c.cardName AS cardName, l.editionCode AS editionCode FROM listing l LEFT JOIN card c ON c.id = l.cardId WHERE COALESCE(l.quantity,0) <= ? ORDER BY COALESCE(l.quantity,0) ASC LIMIT 200;').bind(threshold).all();
    const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);
    const alerts = rows.map((r) => ({ listingId: r.listingId, quantity: r.quantity || 0, cardName: r.cardName || 'Unknown', editionCode: r.editionCode || null, finalPrice: Math.round((r.referencePrice || 0) * 100) / 100 }));

    return new Response(JSON.stringify({ alerts }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ alerts: [] , error: String(err)}), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

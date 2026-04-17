import { pickDb, ensureSchema } from '../../_shared/d1.js';

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const url = new URL(request.url);
    const threshold = Number(url.searchParams.get('threshold') || url.searchParams.get('t') || '2');
    const limit = Math.min(Number(url.searchParams.get('limit') || '200'), 1000);

    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    const res = await db.prepare(`SELECT l.id as listingId, l.quantity, l.editionCode, c.cardName, c.externalId FROM listing l JOIN card c ON l.cardId = c.id WHERE l.quantity <= ? ORDER BY l.quantity ASC LIMIT ?`) .bind(threshold, limit).all();
    const rows = Array.isArray(res.results) ? res.results : (Array.isArray(res) ? res : []);

    return new Response(JSON.stringify(rows), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify([]), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

import { pickDb, ensureSchema } from '../../_shared/d1.js';
import CardService from '../../_shared/cardService.js';

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const params = (request.method === 'GET') ? Object.fromEntries(new URL(request.url).searchParams.entries()) : await request.json().catch(() => ({}));
    const name = params.name || params.q || null;
    const code = params.code || null;
    const tcgId = params.tcgId || params.tcg || null;
    const limit = params.limit ? Number(params.limit) : undefined;

    if (!name && !code) {
      return new Response(JSON.stringify({ success: false, error: 'name or code query parameter is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    let cards = [];
    if (code) {
      cards = await CardService.searchByCode(db, code, tcgId, limit || 50);
    } else {
      cards = await CardService.searchByName(db, name, tcgId, limit || 20);
    }

    return new Response(JSON.stringify(cards), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

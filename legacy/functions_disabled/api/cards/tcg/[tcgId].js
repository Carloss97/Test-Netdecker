import { pickDb, ensureSchema } from '../../../_shared/d1.js';
import CardService from '../../../_shared/cardService.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  try {
    const { tcgId } = params || {};
    if (!tcgId) return new Response(JSON.stringify({ success: false, error: 'tcgId missing' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);
    const cards = await CardService.getCardsByTCG(db, tcgId);
    return new Response(JSON.stringify(cards), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

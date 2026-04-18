import { pickDb, ensureSchema } from '../../../_shared/d1.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  try {
    const id = params && (params.id || params.editionId) ? String(params.id || params.editionId) : null;
    if (!id) return new Response(JSON.stringify({ success: false, error: 'id required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    const edRes = await db.prepare('SELECT id, editionCode, editionName FROM edition WHERE id = ? LIMIT 1').bind(id).all();
    const edition = Array.isArray(edRes?.results) ? edRes.results[0] : (Array.isArray(edRes) ? edRes[0] : null);
    if (!edition) return new Response(JSON.stringify({ success: false, error: 'Edition not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    const cardsRes = await db.prepare('SELECT id, cardCode, cardName, cardNumber, rarity FROM card WHERE editionCode = ? ORDER BY cardNumber ASC, cardName ASC').bind(edition.editionCode).all();
    const cards = Array.isArray(cardsRes?.results) ? cardsRes.results : (Array.isArray(cardsRes) ? cardsRes : []);

    const listingsRes = await db.prepare('SELECT id, cardId, condition, quantity, referencePrice FROM listing WHERE editionCode = ?').bind(edition.editionCode).all();
    const listings = Array.isArray(listingsRes?.results) ? listingsRes.results : (Array.isArray(listingsRes) ? listingsRes : []);

    const listingsByCard = new Map();
    for (const l of listings) {
      const key = l.cardId || l.CARDID || l.cardid;
      if (!listingsByCard.has(key)) listingsByCard.set(key, []);
      listingsByCard.get(key).push({ id: l.id, condition: l.condition, quantity: l.quantity, referencePrice: l.referencePrice });
    }

    const header = ['listingId', 'cardCode', 'cardName', 'cardNumber', 'rarity', 'condition', 'quantity', 'referencePrice'];
    const rows = [];
    for (const c of cards) {
      const cardListings = listingsByCard.get(c.id) || [];
      if (cardListings.length > 0) {
        for (const li of cardListings) {
          rows.push([
            li.id || '',
            c.cardCode || '',
            c.cardName || '',
            c.cardNumber || '',
            c.rarity || '',
            li.condition || '',
            String(li.quantity || ''),
            String(li.referencePrice ?? ''),
          ]);
        }
      } else {
        rows.push(['', c.cardCode || '', c.cardName || '', c.cardNumber || '', c.rarity || '', '', '', '']);
      }
    }

    const csv = [header, ...rows].map((cols) => cols.map((v) => `"${String(v).replace(/"/g, '""') }"`).join(',')).join('\r\n');
    const filename = `${edition.editionCode}-inventory-template.csv`;
    return new Response(csv, { status: 200, headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="${filename}"` } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export default onRequest;

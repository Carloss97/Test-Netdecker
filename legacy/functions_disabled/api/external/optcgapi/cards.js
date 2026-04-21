import { getGroups, getSetCards } from '../../../_shared/tcgcsv.js';

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request } = context;
  try {
    const url = new URL(request.url);
    const limit = Math.min(parseInt(String(url.searchParams.get('limit') || '100'), 10) || 100, 500);
    const offset = Math.max(parseInt(String(url.searchParams.get('offset') || '0'), 10) || 0, 0);

    const tcg = 'ONE_PIECE';
    let sets;
    try {
      sets = await getGroups(tcg);
    } catch (err) {
      return json({ success: false, error: 'TCGCSV getGroups failed', detail: String(err) }, 502);
    }

    const cards = [];
    for (const s of sets) {
      try {
        const sc = await getSetCards(tcg, s.abbreviation || String(s.groupId));
        if (Array.isArray(sc) && sc.length > 0) cards.push(...sc.map((c) => ({ ...c, editionCode: (s.abbreviation || String(s.groupId)).toUpperCase() })));
      } catch (err) {
        // continue on per-set failure
      }
    }

    const total = cards.length;
    const paginated = cards.slice(offset, offset + limit);

    return json({ success: true, source: 'tcgcsv', total, limit, offset, returned: paginated.length, cards: paginated });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default onRequest;

import { CardDatabaseService } from '../../../../services/CardDatabaseService.js';

function headersFromResponse(r) {
  const ct = r.headers.get('content-type') || 'application/json';
  return { 'Content-Type': ct };
}

export async function onRequest(context) {
  try {
    const { request } = context;
    const url = new URL(request.url);
    const params = new URLSearchParams(url.search);
    const cardsetParam = params.get('cardset');

    // If cardset looks like a code, try to resolve to the provider's set name
    if (cardsetParam) {
      const code = String(cardsetParam).trim();
      if (/^[A-Z0-9_-]{2,6}$/.test(code)) {
        try {
          const sets = await CardDatabaseService.listSets('YUGIOH');
          const found = (sets || []).find((s) => String(s.code || '').toUpperCase() === code.toUpperCase() || String(s.name || '').toUpperCase() === code.toUpperCase());
          if (found) {
            params.set('cardset', String(found.name));
          }
        } catch (_) {
          // ignore mapping errors and pass through original params
        }
      }
    }

    const target = `https://db.ygoprodeck.com/api/v7/cardinfo.php?${params.toString()}`;
    const r = await fetch(target, { method: 'GET' });
    const txt = await r.text();
    return new Response(txt, { status: r.status, headers: headersFromResponse(r) });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

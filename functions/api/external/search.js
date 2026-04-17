import { getGroups, getGroupProducts } from '../../_shared/tcgcsv.js';

export async function onRequest(context) {
  const { request } = context;
  try {
    const url = new URL(request.url);
    const tcgRaw = (url.searchParams.get('tcg') || '').toUpperCase();
    const query = (url.searchParams.get('query') || url.searchParams.get('q') || '').trim();
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));

    if (!query) {
      return new Response(JSON.stringify({ success: false, error: 'query param is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const supported = ['MAGIC', 'POKEMON', 'YUGIOH', 'ONE_PIECE', 'DIGIMON', 'WEISS_SCHWARZ'];
    const tcgsToSearch = tcgRaw && supported.includes(tcgRaw) ? [tcgRaw] : supported;

    const lowerQ = query.toLowerCase();
    const results = [];

    for (const tcg of tcgsToSearch) {
      const groups = await getGroups(tcg).catch(() => []);
      for (const g of groups) {
        const products = await getGroupProducts(tcg, g.groupId).catch(() => []);
        for (const p of (products || [])) {
          try {
            if (!p || !p.name) continue;
            if (p.name.toLowerCase().includes(lowerQ)) {
              const ext = p.extendedData || [];
              const cardNumberEntry = ext.find((e) => ['number','cardnumber','collectornumber'].includes(((e.name||e.displayName)||'').toLowerCase()));
              const rarityEntry = ext.find((e) => ((e.name||e.displayName)||'').toLowerCase() === 'rarity');

              results.push({
                externalId: String(p.productId),
                tcg,
                cardName: p.name,
                cardNumber: cardNumberEntry ? cardNumberEntry.value : null,
                rarity: rarityEntry ? rarityEntry.value : (p.subTypeName || null),
                editionCode: (g.abbreviation || String(g.groupId)).toUpperCase(),
                editionName: g.name || null,
                imageUrl: p.imageUrl || null,
                source: 'tcgcsv',
              });

              if (results.length >= limit) break;
            }
          } catch (_) {}
        }
        if (results.length >= limit) break;
      }
      if (results.length >= limit) break;
    }

    const start = (page - 1) * limit;
    const paged = results.slice(start, start + limit);

    return new Response(JSON.stringify({ success: true, query, total: results.length, cards: paged }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

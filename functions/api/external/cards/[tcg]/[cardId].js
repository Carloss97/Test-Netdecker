import { getGroups, getGroupProducts, getGroupPrices } from '../../../../_shared/tcgcsv.js';

export async function onRequest(context) {
  const { request, params } = context;
  try {
    const tcg = String(params.tcg || '').toUpperCase();
    const cardId = String(params.cardId || '');
    if (!tcg || !cardId) {
      return new Response(JSON.stringify({ success: false, error: 'tcg and cardId required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    let groups;
    try {
      groups = await getGroups(tcg);
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: 'TCGCSV getGroups failed', detail: String(e) }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }
    for (const g of groups) {
      const products = await getGroupProducts(tcg, g.groupId).catch(() => []);
      const numeric = Number(cardId);
      const found = products.find((p) => String(p.productId) === String(cardId) || (numeric && p.productId === numeric));
      if (found) {
        const prices = await getGroupPrices(tcg, g.groupId).catch(() => []);
        const matchingPrices = prices.filter((pr) => String(pr.productId) === String(found.productId));
        const best = matchingPrices.sort((a,b) => (b.marketPrice ?? b.midPrice ?? b.lowPrice ?? -1) - (a.marketPrice ?? a.midPrice ?? a.lowPrice ?? -1))[0];
        const ext = Array.isArray(found.extendedData) ? found.extendedData : (found.extendedData ? [found.extendedData] : []);
        const cardNumberEntry = ext.find((e) => ['number','cardnumber','collectornumber'].includes(((e.name||e.displayName)||'').toLowerCase()));
        const rarityEntry = ext.find((e) => ((e.name||e.displayName)||'').toLowerCase() === 'rarity');

        const card = {
          externalId: String(found.productId),
          source: 'tcgcsv',
          tcg,
          cardName: found.name,
          cardNumber: cardNumberEntry ? cardNumberEntry.value : null,
          editionCode: (g.abbreviation || String(g.groupId)).toUpperCase(),
          editionName: g.name || null,
          rarity: rarityEntry ? rarityEntry.value : (found.subTypeName || null),
          imageUrl: found.imageUrl || null,
          priceLow: best?.lowPrice ?? null,
          priceMid: best?.midPrice ?? null,
          priceMarket: best ? (best.marketPrice ?? best.midPrice ?? best.lowPrice) : null,
        };

        return new Response(JSON.stringify({ success: true, card }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }

    return new Response(JSON.stringify({ success: true, card: null }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

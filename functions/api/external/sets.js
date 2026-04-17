import { getGroups, getGroupProducts } from '../../_shared/tcgcsv.js';

export async function onRequest(context) {
  const { request } = context;
  try {
    const url = new URL(request.url);
    const tcgRaw = (url.searchParams.get('tcg') || '').toUpperCase();

    const supported = ['MAGIC', 'POKEMON', 'YUGIOH', 'ONE_PIECE', 'DIGIMON', 'WEISS_SCHWARZ'];
    if (!supported.includes(tcgRaw)) {
      return new Response(JSON.stringify({ success: false, error: 'tcg must be one of: MAGIC, POKEMON, YUGIOH, ONE_PIECE, DIGIMON, WEISS_SCHWARZ' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    let groups;
    try {
      groups = await getGroups(tcgRaw);
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: 'TCGCSV getGroups failed', detail: String(e) }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    const totalCardsOf = (g) => {
      const candidates = [g.totalCards, g.cardCount, g.totalItems, g.productCount, g.numOfCards];
      for (const v of candidates) {
        if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
      }
      return 0;
    };

    // Build basic set list
    const sets = groups.map((g) => ({
      groupId: g.groupId,
      code: (g.abbreviation || String(g.groupId) || '').toUpperCase(),
      name: g.name || '',
      releaseDate: g.publishedOn || null,
      totalCards: totalCardsOf(g) || 0,
      source: 'tcgcsv',
    }));

    // For sets without a totalCards value, fetch product counts with limited concurrency
    const toFetch = sets.filter((s) => !s.totalCards || s.totalCards === 0);
    const concurrency = 6;
    for (let i = 0; i < toFetch.length; i += concurrency) {
      const batch = toFetch.slice(i, i + concurrency);
      await Promise.all(batch.map(async (s) => {
        try {
          const products = await getGroupProducts(tcgRaw, s.groupId).catch(() => []);
          s.totalCards = Array.isArray(products) ? products.length : 0;
        } catch (_) {
          s.totalCards = 0;
        }
      }));
    }

    // Cleanup: remove internal groupId before returning
    const out = sets.map(({ groupId, ...rest }) => rest);

    return new Response(JSON.stringify({ success: true, tcg: tcgRaw, total: out.length, sets: out }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

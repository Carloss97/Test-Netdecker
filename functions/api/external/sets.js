export async function onRequest(context) {
  const { request, env } = context;
  try {
    const url = new URL(request.url);
    const tcgRaw = (url.searchParams.get('tcg') || '').toUpperCase();

    const TCGLookup = {
      MAGIC: 1,
      YUGIOH: 2,
      POKEMON: 3,
      WEISS_SCHWARZ: 20,
      DIGIMON: 63,
      ONE_PIECE: 68,
    };

    if (!TCGLookup[tcgRaw]) {
      return new Response(JSON.stringify({ success: false, error: 'tcg must be one of: MAGIC, POKEMON, YUGIOH, ONE_PIECE, DIGIMON, WEISS_SCHWARZ' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const categoryId = TCGLookup[tcgRaw];
    const base = 'https://tcgcsv.com/tcgplayer';

    const resp = await fetch(`${base}/${categoryId}/groups`, { headers: { Accept: 'application/json' } });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return new Response(JSON.stringify({ success: false, error: 'failed to fetch tcgcsv groups', status: resp.status, body: text }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    const body = await resp.json().catch(() => ({}));
    const groups = Array.isArray(body.results) ? body.results : [];

    const totalCardsOf = (g) => {
      const candidates = [g.totalCards, g.cardCount, g.totalItems, g.productCount, g.numOfCards];
      for (const v of candidates) {
        if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
      }
      return 0;
    };

    const sets = groups.map((g) => ({
      code: (g.abbreviation || String(g.groupId) || '').toUpperCase(),
      name: g.name || '',
      releaseDate: g.publishedOn || null,
      totalCards: totalCardsOf(g),
      source: 'tcgcsv',
    }));

    return new Response(JSON.stringify({ success: true, tcg: tcgRaw, total: sets.length, sets }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

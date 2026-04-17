const BASE = (typeof process !== 'undefined' && process.env && process.env.TCGCSV_BASE) || (typeof globalThis !== 'undefined' && globalThis.TCGCSV_BASE) || 'https://tcgcsv.com/tcgplayer';

// In-memory cache and concurrency limiter (per-worker instance). TTL and concurrency
// can be tuned via env vars: TCGCSV_CACHE_TTL (seconds) and TCGCSV_CONCURRENCY_LIMIT
const DEFAULT_TTL = Number((typeof process !== 'undefined' && process.env && process.env.TCGCSV_CACHE_TTL) || (typeof globalThis !== 'undefined' && globalThis.TCGCSV_CACHE_TTL) || 3600);
const CONCURRENCY_LIMIT = Number((typeof process !== 'undefined' && process.env && process.env.TCGCSV_CONCURRENCY_LIMIT) || (typeof globalThis !== 'undefined' && globalThis.TCGCSV_CONCURRENCY_LIMIT) || 6);

if (!globalThis.__TCGCSV_CACHE_V1) globalThis.__TCGCSV_CACHE_V1 = new Map();
if (!globalThis.__TCGCSV_CONCURRENCY_V1) globalThis.__TCGCSV_CONCURRENCY_V1 = { active: 0, queue: [] };

const TCGCSV_CATEGORY_IDS = {
  MAGIC: 1,
  YUGIOH: 2,
  POKEMON: 3,
  WEISS_SCHWARZ: 20,
  DIGIMON: 63,
  ONE_PIECE: 68,
};

async function fetchJson(url) {
  const cacheKey = String(url);
  const cache = globalThis.__TCGCSV_CACHE_V1;
  const cached = cache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < (DEFAULT_TTL * 1000)) return cached.data;

  // concurrency limiter
  const concurrency = globalThis.__TCGCSV_CONCURRENCY_V1;
  if (concurrency.active >= CONCURRENCY_LIMIT) {
    await new Promise((resolve) => concurrency.queue.push(resolve));
  }
  concurrency.active += 1;

  try {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          throw new Error(`fetch ${url} failed: ${res.status} ${t}`);
        }
        const data = await res.json();
        try { cache.set(cacheKey, { ts: Date.now(), data }); } catch (_) {}
        return data;
      } catch (err) {
        if (attempt >= maxAttempts) {
          throw err;
        }
        try { console.warn(`[tcgcsv] fetch attempt ${attempt} failed for ${url}: ${err instanceof Error ? err.message : String(err)} — retrying`); } catch (_) {}
        const wait = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  } finally {
    concurrency.active -= 1;
    try {
      const next = concurrency.queue.shift();
      if (next) next();
    } catch (_) {}
  }
}

function normalizeSetIdentifier(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function getExtendedValue(extendedData, fieldName) {
  if (!Array.isArray(extendedData)) return undefined;
  const lc = fieldName.toLowerCase();
  const e = extendedData.find((x) => ((x.name || x.displayName) || '').toLowerCase() === lc);
  return e ? e.value : undefined;
}

function bestPrice(p) {
  const v = (p && (p.marketPrice ?? p.midPrice ?? p.lowPrice));
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
}

function isCardLikeProduct(product) {
  const ext = product.extendedData || [];
  return ext.some((entry) => {
    const key = (entry.name || entry.displayName || '').toLowerCase();
    return key === 'rarity' || key === 'number' || key === 'cardnumber' || key === 'collectornumber';
  });
}

function pickBestPrice(prices) {
  if (!Array.isArray(prices) || prices.length === 0) return undefined;
  return prices.sort((a, b) => {
    const va = a.marketPrice ?? a.midPrice ?? a.lowPrice ?? -1;
    const vb = b.marketPrice ?? b.midPrice ?? b.lowPrice ?? -1;
    return vb - va;
  })[0];
}

async function getGroups(tcg) {
  const categoryId = TCGCSV_CATEGORY_IDS[String(tcg)];
  if (!categoryId) return [];
  const data = await fetchJson(`${BASE}/${categoryId}/groups`);
  return Array.isArray(data?.results) ? data.results : [];
}

async function getGroupProducts(tcg, groupId) {
  const categoryId = TCGCSV_CATEGORY_IDS[String(tcg)];
  if (!categoryId) return [];
  const data = await fetchJson(`${BASE}/${categoryId}/${groupId}/products`);
  return Array.isArray(data?.results) ? data.results : [];
}

async function getGroupPrices(tcg, groupId) {
  const categoryId = TCGCSV_CATEGORY_IDS[String(tcg)];
  if (!categoryId) return [];
  const data = await fetchJson(`${BASE}/${categoryId}/${groupId}/prices`);
  return Array.isArray(data?.results) ? data.results : [];
}

function extractYgoSetCodePrefix(cardSetCode) {
  const raw = String(cardSetCode || '').trim();
  if (!raw) return '';
  const upper = raw.toUpperCase();

  // Pattern: prefix - letters(1-3) numbers(optional), e.g. '-EN', '-EN01'
  let m = upper.match(/^(.*?)-[A-Z]{1,3}\d*$/);
  if (m && m[1]) return m[1];

  // Pattern: prefix - digits, e.g. '-1', '-12'
  m = upper.match(/^(.*?)-\d+$/);
  if (m && m[1]) return m[1];

  // Fallback: remove any non-alphanumeric and return uppercase compact form
  return upper.replace(/[^A-Z0-9]/g, '');
}

function resolveGroupBySetCode(tcg, groups, setCode) {
  const normalizedCode = String(setCode || '').trim().toUpperCase();
  const normalizedCompactCode = normalizeSetIdentifier(setCode);
  const ygoPrefix = String(tcg || '').toUpperCase() === 'YUGIOH' ? extractYgoSetCodePrefix(setCode) : '';

  return groups.find((g) => {
    const abbr = (g.abbreviation || '').toUpperCase();
    if (abbr === normalizedCode) return true;
    if (String(g.groupId) === normalizedCode) return true;
    if (normalizeSetIdentifier(g.abbreviation || '') === normalizedCompactCode) return true;
    if (normalizeSetIdentifier(g.name || '') === normalizedCompactCode) return true;

    if (ygoPrefix) {
      const abbrPrefix = extractYgoSetCodePrefix(abbr);
      if (abbrPrefix && abbrPrefix === ygoPrefix) return true;
      const namePrefix = extractYgoSetCodePrefix(String(g.name || '').toUpperCase());
      if (namePrefix && namePrefix === ygoPrefix) return true;
    }

    return false;
  });
}

async function getSetCards(tcg, setCode) {
  const groups = await getGroups(tcg);
  const group = resolveGroupBySetCode(tcg, groups, setCode);
  if (!group) return [];

  const [products, prices] = await Promise.all([
    getGroupProducts(tcg, group.groupId),
    getGroupPrices(tcg, group.groupId),
  ]);

  const priceByProductId = new Map();
  for (const p of prices) {
    const existing = priceByProductId.get(p.productId);
    if (!existing) {
      priceByProductId.set(p.productId, p);
      continue;
    }
    const best = pickBestPrice([existing, p]);
    if (best) priceByProductId.set(p.productId, best);
  }

  const cards = (products || []).filter(isCardLikeProduct).map((product) => {
    const ext = product.extendedData || [];
    const rarity = getExtendedValue(ext, 'Rarity') || product.subTypeName || null;
    const cardNumber = getExtendedValue(ext, 'Number') || getExtendedValue(ext, 'CardNumber') || getExtendedValue(ext, 'CollectorNumber') || null;
    const price = priceByProductId.get(product.productId);
    const priceMarket = price ? bestPrice(price) : undefined;
    return {
      externalId: String(product.productId),
      source: 'tcgcsv',
      tcg,
      cardName: product.name,
      cardNumber: cardNumber,
      editionCode: (group.abbreviation || String(group.groupId)).toUpperCase(),
      editionName: group.name || null,
      rarity,
      imageUrl: product.imageUrl || null,
      priceLow: price?.lowPrice ?? null,
      priceMid: price?.midPrice ?? null,
      priceMarket: priceMarket ?? null,
    };
  });

  try {
    console.log(`[tcgcsv] getSetCards: tcg=${tcg} set=${setCode} groupId=${group.groupId} products=${(products||[]).length} cardLike=${cards.length}`);
  } catch (_) {}

  return cards;
}

export { getGroups, getSetCards, getGroupProducts, getGroupPrices, TCGCSV_CATEGORY_IDS, resolveGroupBySetCode };

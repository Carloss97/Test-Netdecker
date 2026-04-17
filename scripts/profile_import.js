#!/usr/bin/env node
const { performance } = require('perf_hooks');

function isCardLikeProduct(product) {
  const ext = product.extendedData || [];
  return ext.some((entry) => {
    const key = (entry.name || entry.displayName || '').toLowerCase();
    return key === 'rarity' || key === 'number' || key === 'cardnumber' || key === 'collectornumber';
  });
}

function makeProducts(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      productId: i + 1,
      name: `Card ${i + 1}`,
      extendedData: [
        { name: 'Rarity', value: i % 10 === 0 ? 'Rare' : 'Common' },
        { name: 'Number', value: `${i + 1}` }
      ],
      imageUrl: null,
      subTypeName: null
    });
  }
  return out;
}

async function runProfile({ n = 5000, marginMultiplier = 1.2, initialQuantity = 1, tcg = 'MAGIC' } = {}) {
  console.log(`Profile import simulation: N=${n}`);
  const t0 = performance.now();
  const products = makeProducts(n);
  const t1 = performance.now();
  console.log('generateProducts', (t1 - t0).toFixed(2), 'ms');

  // make synthetic prices
  const prices = [];
  for (let p of products) {
    prices.push({ productId: p.productId, marketPrice: ((p.productId % 10) + 1) * 0.5, midPrice: null, lowPrice: null });
  }
  const t2 = performance.now();
  console.log('generatePrices', (t2 - t1).toFixed(2), 'ms');

  // build price map
  const priceByProductId = new Map();
  for (const p of prices) {
    const existing = priceByProductId.get(p.productId);
    if (!existing) priceByProductId.set(p.productId, p);
    else {
      const candidates = [existing, p];
      candidates.sort((a,b) => (b.marketPrice ?? b.midPrice ?? b.lowPrice ?? -1) - (a.marketPrice ?? a.midPrice ?? a.lowPrice ?? -1));
      priceByProductId.set(p.productId, candidates[0]);
    }
  }
  const t3 = performance.now();
  console.log('buildPriceMap', (t3 - t2).toFixed(2), 'ms');

  // filter and build cards
  const cards = products.filter(isCardLikeProduct).map((product) => {
    const ext = product.extendedData || [];
    const getExt = (k) => {
      const found = ext.find((e) => ((e.name || e.displayName) || '').toLowerCase() === String(k).toLowerCase());
      return found ? found.value : undefined;
    };
    const price = priceByProductId.get(product.productId);
    const priceMarket = price ? (price.marketPrice ?? price.midPrice ?? price.lowPrice) : null;
    return {
      externalId: String(product.productId),
      tcg,
      cardName: product.name,
      cardNumber: getExt('number') || getExt('cardnumber') || getExt('collectornumber') || null,
      rarity: getExt('rarity') || product.subTypeName || null,
      imageUrl: product.imageUrl || null,
      priceLow: price?.lowPrice ?? null,
      priceMid: price?.midPrice ?? null,
      priceMarket: priceMarket ?? null,
    };
  });
  const t4 = performance.now();
  console.log('filter+map->cards', (t4 - t3).toFixed(2), 'ms', 'cards=', cards.length);

  // Build DB rows
  const cardRows = [];
  const listingRows = [];
  const priceHistoryRows = [];
  const usdToCLP = 1000;
  const editionCode = 'SIM';

  for (const c of cards) {
    const cardId = `${tcg}:${c.externalId}`;
    cardRows.push([cardId, c.externalId, tcg, editionCode, c.cardNumber || c.externalId, c.cardName || '', c.rarity || null, c.imageUrl || null, c.priceMarket || null]);
    const listingId = `L-${Date.now()}-${Math.floor(Math.random()*100000)}`;
    const ref = typeof c.priceMarket === 'number' && c.priceMarket > 0 ? c.priceMarket : (c.priceMid || c.priceLow || 0.5);
    const finalPrice = Math.round(ref * marginMultiplier * usdToCLP);
    listingRows.push([listingId, cardId, editionCode, ref, marginMultiplier, finalPrice, initialQuantity, 'active', new Date().toISOString()]);
    const phId = `PH-${Date.now()}-${Math.floor(Math.random()*100000)}`;
    priceHistoryRows.push([phId, listingId, null, finalPrice, null, ref, null, usdToCLP, 'initial_import', null, 'import', '', new Date().toISOString()]);
  }
  const t5 = performance.now();
  console.log('buildRows', (t5 - t4).toFixed(2), 'ms', 'cardRows=', cardRows.length, 'listingRows=', listingRows.length);

  // simulate runBatchedInsert batch computation
  const SQLITE_MAX_VARS = 900;
  const runBatchedInsertSim = async (tableCols, rows) => {
    if (!rows || rows.length === 0) return;
    const colCount = tableCols.cols.length;
    const safeBatch = Math.max(1, Math.floor(SQLITE_MAX_VARS / Math.max(1, colCount)));
    const batches = [];
    for (let i = 0; i < rows.length; i += safeBatch) batches.push(rows.slice(i, i + safeBatch));
    const start = performance.now();
    for (const batch of batches) {
      // simulate db prepare/run cost negligible — but we measure JS construction time
      const placeholders = batch.map(() => `(${new Array(colCount).fill('?').join(',')})`).join(',');
      const sql = `INSERT INTO ${tableCols.table} (${tableCols.cols.join(',')}) VALUES ${placeholders};`;
      // simulate minimal async I/O
      await Promise.resolve();
    }
    return performance.now() - start;
  };

  const t6 = performance.now();
  const tCardBatch = await runBatchedInsertSim({ table: 'card', cols: ['id','externalId','tcg','editionCode','cardCode','cardName','rarity','imageUrl','priceMarket'] }, cardRows);
  const t7 = performance.now();
  const tListingBatch = await runBatchedInsertSim({ table: 'listing', cols: ['id','cardId','editionCode','referencePrice','marginMultiplier','finalPrice','quantity','status','lastSyncedAt'] }, listingRows);
  const t8 = performance.now();

  console.log('batch simulation: cardBatchesTime', tCardBatch.toFixed(2), 'ms, listingBatchesTime', (tListingBatch).toFixed(2), 'ms');
  console.log('totalProfile', (performance.now() - t0).toFixed(2), 'ms');
}

(async () => {
  const N = parseInt(process.argv[2] || '5000', 10);
  await runProfile({ n: N });
})();

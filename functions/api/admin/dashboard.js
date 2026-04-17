import { pickDb, ensureSchema, firstRow } from '../../_shared/d1.js';
import { getUSDtoCLPRateMetaFast } from '../../_shared/exchange-rate.js';
import { validateToken } from '../../_shared/adminAuth.js';

function extractToken(request) {
  const auth = request.headers.get('authorization') || '';
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return request.headers.get('x-admin-token') || '';
}

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const token = String(extractToken(request) || '');
    if (!token) return json({ success: false, error: 'Missing token' }, 401);
    const user = await validateToken(env, token);
    if (!user) return json({ success: false, error: 'Invalid token' }, 401);

    const db = pickDb(env);
    if (db) await ensureSchema(db);

    const totalCards = Number(firstRow(db && (await db.prepare('SELECT COUNT(1) as cnt FROM card').all()))?.cnt || 0);
    const totalListings = Number(firstRow(db && (await db.prepare('SELECT COUNT(1) as cnt FROM listing').all()))?.cnt || 0);
    const activeListings = Number(firstRow(db && (await db.prepare("SELECT COUNT(1) as cnt FROM listing WHERE status IN ('active','manual') AND quantity > 0").all()))?.cnt || 0);
    const lowStockListings = Number(firstRow(db && (await db.prepare("SELECT COUNT(1) as cnt FROM listing WHERE status IN ('active','manual') AND quantity > 0 AND quantity <= 5").all()))?.cnt || 0);
    const outOfStockListings = Number(firstRow(db && (await db.prepare("SELECT COUNT(1) as cnt FROM listing WHERE status IN ('active','manual') AND quantity <= 0 AND everHadStock = 1").all()))?.cnt || 0);
    const totalOrders = Number(firstRow(db && (await db.prepare('SELECT COUNT(1) as cnt FROM "order"').all()))?.cnt || 0);
    const pendingOrders = Number(firstRow(db && (await db.prepare("SELECT COUNT(1) as cnt FROM \"order\" WHERE status = 'PENDING'").all()))?.cnt || 0);

    const recentImports = db
      ? (Array.isArray((await db.prepare('SELECT id, fileName, status, totalRecords, successCount, failureCount, createdAt FROM inventoryImport ORDER BY createdAt DESC LIMIT 5').all())?.results)
          ? (await db.prepare('SELECT id, fileName, status, totalRecords, successCount, failureCount, createdAt FROM inventoryImport ORDER BY createdAt DESC LIMIT 5').all()).results
          : (await db.prepare('SELECT id, fileName, status, totalRecords, successCount, failureCount, createdAt FROM inventoryImport ORDER BY createdAt DESC LIMIT 5').all()))
      : [];

    const inventoryValueRow = db ? firstRow(await db.prepare("SELECT COALESCE(SUM(finalPrice),0) as total FROM listing WHERE status IN ('active','manual') AND quantity > 0").all()) : { total: 0 };
    const inventoryValueCLP = Number(inventoryValueRow?.total || 0);

    const recentSyncRuns = db ? (Array.isArray((await db.prepare('SELECT id, source, status, total, updated, volatile, failed, startedAt, completedAt FROM priceSyncRun ORDER BY startedAt DESC LIMIT 5').all())?.results) ? (await db.prepare('SELECT id, source, status, total, updated, volatile, failed, startedAt, completedAt FROM priceSyncRun ORDER BY startedAt DESC LIMIT 5').all()).results : (await db.prepare('SELECT id, source, status, total, updated, volatile, failed, startedAt, completedAt FROM priceSyncRun ORDER BY startedAt DESC LIMIT 5').all())) : [];

    const exchangeRateMeta = db ? await getUSDtoCLPRateMetaFast(env, db).catch(() => null) : null;

    const responsePayload = {
      success: true,
      kpis: {
        catalog: { totalCards, totalListings, activeListings, lowStockListings, outOfStockListings },
        inventory: { totalValueCLP: inventoryValueCLP, currency: 'CLP' },
        orders: { total: totalOrders, pending: pendingOrders },
        exchangeRate: exchangeRateMeta ? { usdToCLP: exchangeRateMeta.usdToCLP, source: exchangeRateMeta.source, fetchedAt: exchangeRateMeta.fetchedAt } : null,
      },
      recentImports: Array.isArray(recentImports) ? recentImports : [],
      recentSyncRuns: Array.isArray(recentSyncRuns) ? recentSyncRuns : [],
    };

    return json(responsePayload);
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default { onRequest };
import { pickDb, ensureSchema, buildSelectColumns } from '../../_shared/d1.js';
import { getUSDtoCLPRateMetaFast } from '../../_shared/exchange-rate.js';

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const db = pickDb(env);
    if (!db) {
      // return sensible defaults for frontend when DB not bound
      const defaultRate = Number(env.MANUAL_USD_TO_CLP || env.VITE_MANUAL_USD_TO_CLP || 950);
      const dashboard = {
        kpis: {
          catalog: { totalCards: 0, totalListings: 0, activeListings: 0, lowStockListings: 0, outOfStockListings: 0 },
          inventory: { totalValueCLP: 0, currency: 'CLP' },
          orders: { total: 0, pending: 0 },
          exchangeRate: { usdToCLP: defaultRate, source: 'env', fetchedAt: new Date().toISOString() },
        },
        recentImports: [],
        recentSyncRuns: [],
      };
      return new Response(JSON.stringify(dashboard), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    await ensureSchema(db);

    // KPIs
    const totalCardsRes = await db.prepare('SELECT COUNT(DISTINCT id) AS cnt FROM card;').all();
    const totalListingsRes = await db.prepare('SELECT COUNT(*) AS cnt FROM listing;').all();
    const activeListingsRes = await db.prepare('SELECT COUNT(*) AS cnt FROM listing WHERE quantity > 0;').all();
    const lowStockRes = await db.prepare('SELECT COUNT(*) AS cnt FROM listing WHERE quantity <= 5;').all();
    const outOfStockRes = await db.prepare('SELECT COUNT(*) AS cnt FROM listing WHERE quantity = 0;').all();
    // compute inventory sum via dynamic select to tolerate missing columns in older D1 schemas
    const listingColsForSum = await buildSelectColumns(db, 'listing', 'l', ['referencePrice','marginMultiplier','quantity']);
    const listingRowsRes = await db.prepare(`SELECT ${listingColsForSum} FROM listing l`).all();
    const listingRows = Array.isArray(listingRowsRes?.results) ? listingRowsRes.results : (Array.isArray(listingRowsRes) ? listingRowsRes : []);
    let sumUsd = 0;
    for (const lr of listingRows) {
      const ref = Number(lr.referencePrice || 0);
      const margin = Number(typeof lr.marginMultiplier !== 'undefined' && lr.marginMultiplier !== null ? lr.marginMultiplier : 1) || 1;
      const qty = Number(lr.quantity || 0) || 0;
      sumUsd += (ref * margin * qty);
    }

    const totalCards = (Array.isArray(totalCardsRes?.results) ? totalCardsRes.results[0]?.cnt : (Array.isArray(totalCardsRes) ? totalCardsRes[0]?.cnt : 0)) || 0;
    const totalListings = (Array.isArray(totalListingsRes?.results) ? totalListingsRes.results[0]?.cnt : (Array.isArray(totalListingsRes) ? totalListingsRes[0]?.cnt : 0)) || 0;
    const activeListings = (Array.isArray(activeListingsRes?.results) ? activeListingsRes.results[0]?.cnt : (Array.isArray(activeListingsRes) ? activeListingsRes[0]?.cnt : 0)) || 0;
    const lowStockListings = (Array.isArray(lowStockRes?.results) ? lowStockRes.results[0]?.cnt : (Array.isArray(lowStockRes) ? lowStockRes[0]?.cnt : 0)) || 0;
    const outOfStockListings = (Array.isArray(outOfStockRes?.results) ? outOfStockRes.results[0]?.cnt : (Array.isArray(outOfStockRes) ? outOfStockRes[0]?.cnt : 0)) || 0;
    // sumUsd already computed above

    // Exchange rate: read from appConfig pricingConfig if present
    const cfgRes = await db.prepare('SELECT value FROM appConfig WHERE key = ?').bind('pricingConfig').all();
    let usdToCLP = Number(env.MANUAL_USD_TO_CLP || env.VITE_MANUAL_USD_TO_CLP || 950);
    let exchangeSource = 'env';
    let fetchedAt = null;
    try {
      const cfgRow = Array.isArray(cfgRes?.results) ? cfgRes.results[0] : (Array.isArray(cfgRes) ? cfgRes[0] : null);
      if (cfgRow && cfgRow.value) {
        const parsed = JSON.parse(cfgRow.value);
        if (parsed && parsed.exchangeRate) {
          // If pricing config is set to API mode, prefer the cached/fresh FX value
          if (parsed.exchangeRate.mode === 'api') {
            try {
              const meta = await getUSDtoCLPRateMetaFast(env, db);
              if (meta && Number.isFinite(Number(meta.usdToCLP)) && Number(meta.usdToCLP) > 0) {
                usdToCLP = Number(meta.usdToCLP);
                exchangeSource = meta.source || 'api';
                fetchedAt = meta.fetchedAt || null;
              } else {
                usdToCLP = Number(parsed.exchangeRate.activeRate || usdToCLP);
                exchangeSource = parsed.exchangeRate.source || exchangeSource;
              }
            } catch (_) {
              usdToCLP = Number(parsed.exchangeRate.activeRate || usdToCLP);
              exchangeSource = parsed.exchangeRate.source || exchangeSource;
            }
          } else {
            usdToCLP = Number(parsed.exchangeRate.activeRate || usdToCLP);
            exchangeSource = parsed.exchangeRate.source || exchangeSource;
          }
        }
      }
    } catch (_) {}

    const totalValueCLP = Math.round(Number(sumUsd) * usdToCLP);

    // recent sync runs
    const runCols = await buildSelectColumns(db, 'priceSyncRun', 'p', ['id','source','status','total','updated','volatile','failed','startedAt','completedAt']);
    const runsRes = await db.prepare(`SELECT ${runCols} FROM priceSyncRun p ORDER BY startedAt DESC LIMIT 10;`).all();
    const runsRows = Array.isArray(runsRes?.results) ? runsRes.results : (Array.isArray(runsRes) ? runsRes : []);
    const recentSyncRuns = runsRows.map((r) => ({ id: r.id, source: r.source, status: r.status, total: r.total || 0, updated: r.updated || 0, volatile: r.volatile || 0, failed: r.failed || 0, startedAt: r.startedAt || null, completedAt: r.completedAt || null }));

    const dashboard = {
      kpis: {
        catalog: { totalCards, totalListings, activeListings, lowStockListings, outOfStockListings },
        inventory: { totalValueCLP, currency: 'CLP' },
        orders: { total: 0, pending: 0 },
        exchangeRate: { usdToCLP, source: exchangeSource, fetchedAt },
      },
      recentImports: [],
      recentSyncRuns,
    };

    return new Response(JSON.stringify(dashboard), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

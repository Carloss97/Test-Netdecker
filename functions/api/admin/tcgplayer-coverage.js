import { pickDb, ensureSchema } from '../../_shared/d1.js';

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ global: { totalCards: 0, coveredCards: 0, uncoveredCards: 0, coveragePercent: 0 }, byTcg: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    // total cards is count of card table
    const totalRes = await db.prepare('SELECT COUNT(*) AS cnt FROM card;').all();
    const total = (Array.isArray(totalRes?.results) ? totalRes.results[0]?.cnt : (Array.isArray(totalRes) ? totalRes[0]?.cnt : 0)) || 0;

    // covered cards: those with non-null priceMarket (approx)
    const coveredRes = await db.prepare('SELECT COUNT(*) AS cnt FROM card WHERE priceMarket IS NOT NULL;').all();
    const covered = (Array.isArray(coveredRes?.results) ? coveredRes.results[0]?.cnt : (Array.isArray(coveredRes) ? coveredRes[0]?.cnt : 0)) || 0;

    const uncovered = Math.max(0, total - covered);
    const percent = total === 0 ? 0 : (covered / total) * 100;

    // byTcg: group by tcg
    const byRes = await db.prepare('SELECT tcg, COUNT(*) AS totalCards, SUM(CASE WHEN priceMarket IS NOT NULL THEN 1 ELSE 0 END) AS coveredCards FROM card GROUP BY tcg;').all();
    const byRows = Array.isArray(byRes?.results) ? byRes.results : (Array.isArray(byRes) ? byRes : []);
    const byTcg = byRows.map((r) => ({ tcg: r.tcg, tcgDisplayName: r.tcg, totalCards: r.totalCards || 0, coveredCards: r.coveredCards || 0, uncoveredCards: Math.max(0, (r.totalCards || 0) - (r.coveredCards || 0)), coveragePercent: ((r.totalCards || 0) === 0 ? 0 : ((r.coveredCards || 0) / (r.totalCards || 0)) * 100) }));

    return new Response(JSON.stringify({ global: { totalCards: total, coveredCards: covered, uncoveredCards: uncovered, coveragePercent: percent }, byTcg }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ global: { totalCards: 0, coveredCards: 0, uncoveredCards: 0, coveragePercent: 0 }, byTcg: [], error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

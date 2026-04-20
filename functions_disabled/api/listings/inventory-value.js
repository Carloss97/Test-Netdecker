import { pickDb, ensureSchema } from '../../_shared/d1.js';

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const db = pickDb(env);
    if (!db) return json({ success: false, error: 'No DB binding' }, 500);
    await ensureSchema(db);

    // Compute totals using SQL aggregation
    const res = await db.prepare(`SELECT SUM(COALESCE(l.costPrice,0) * COALESCE(l.quantity,0)) AS totalCost,
      SUM(COALESCE(l.finalPrice,0) * COALESCE(l.quantity,0)) AS totalValue,
      SUM(COALESCE(l.quantity,0)) AS itemCount
      FROM listing l WHERE l.quantity > 0`).all();
    const row = Array.isArray(res?.results) ? res.results[0] : (Array.isArray(res) ? res[0] : {});
    const totalCost = Number(row?.totalCost || 0);
    const totalValue = Number(row?.totalValue || 0);
    const itemCount = Number(row?.itemCount || 0);
    return json({ success: true, totalCost, totalValue, totalProfit: totalValue - totalCost, itemCount });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

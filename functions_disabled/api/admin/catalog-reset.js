import { pickDb, ensureSchema } from '../../_shared/d1.js';
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

    const body = await request.json().catch(() => ({}));
    if (body?.confirm !== true) return json({ success: false, error: 'Must pass { confirm: true } to reset catalog data' }, 400);

    const db = pickDb(env);
    if (db) await ensureSchema(db);
    if (!db) return json({ success: false, error: 'No DB configured' }, 500);

    // delete related data but preserve exchangeRate and appConfig
    await db.prepare('DELETE FROM orderItem').run();
    await db.prepare('DELETE FROM "order"').run();
    await db.prepare('DELETE FROM cart').run();
    await db.prepare('DELETE FROM priceHistory').run();
    try { await db.prepare('DELETE FROM priceSyncRun').run(); } catch (_) {}
    await db.prepare('DELETE FROM listing').run();
    await db.prepare('DELETE FROM card').run();
    await db.prepare('DELETE FROM edition').run();
    await db.prepare('DELETE FROM inventoryImport').run();

    return json({ success: true, message: 'Catalog reset complete. TCG records and exchange rates preserved.' });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default { onRequest };

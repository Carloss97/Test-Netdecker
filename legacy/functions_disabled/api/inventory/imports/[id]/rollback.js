import { pickDb, ensureSchema } from '../../../../../_shared/d1.js';

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env, params } = context;
  try {
    // Basic API key protection like the backend middleware
    const required = env.IMPORT_API_KEY || null;
    if (required) {
      const header = (request.headers.get('x-api-key') || request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      if (!header || header !== required) return json({ success: false, error: 'Unauthorized' }, 401);
    }

    const importId = params && (params.id || params.importId) ? String(params.id || params.importId) : '';
    if (!importId) return json({ success: false, error: 'importId missing' }, 400);

    const db = pickDb(env);
    if (!db) return json({ success: false, error: 'No DB binding available' }, 500);
    await ensureSchema(db);

    const body = await request.json().catch(() => ({}));
    const dryRun = Boolean(body?.dryRun);

    const res = await db.prepare('SELECT * FROM inventoryImport WHERE id = ?').bind(importId).all();
    const item = Array.isArray(res?.results) ? res.results[0] : (Array.isArray(res) ? res[0] : null);
    if (!item) return json({ success: false, error: 'Import not found' }, 404);

    if (dryRun) {
      return json({ success: true, result: { message: 'dryRun preview not implemented; safe no-op', import: item } });
    }

    // Best-effort: mark import as rolled-back in inventoryImport table
    const now = new Date().toISOString();
    await db.prepare('UPDATE inventoryImport SET status = ?, completedAt = ? WHERE id = ?').bind('ROLLED_BACK', now, importId).run();
    return json({ success: true, result: { message: 'marked import as ROLLED_BACK', importId } });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default onRequest;

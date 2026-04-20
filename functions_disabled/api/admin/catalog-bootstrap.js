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
    if (!user || user.role !== 'ADMIN') return json({ success: false, error: 'Forbidden' }, 403);

    const body = request.method === 'GET' ? Object.fromEntries(new URL(request.url).searchParams.entries()) : await request.json().catch(() => ({}));
    const setCode = String(body.setCode || body.code || body.set || '').trim();
    if (!setCode) return json({ success: false, error: 'Provide setCode for bootstrap (single-set mode)' }, 400);

    // Forward to existing external set import handler for single-set bootstrap
    const fakeReq = new Request('https://internal/import-set', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    try {
      const mod = await import('../external/import/set.js');
      if (mod && mod.onRequest) return await mod.onRequest({ request: fakeReq, env });
    } catch (err) {
      return json({ success: false, error: String(err) }, 500);
    }
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

export default { onRequest };

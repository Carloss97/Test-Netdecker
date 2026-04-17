import { validateToken } from '../../_shared/adminAuth.js';

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function extractToken(request) {
  const auth = request.headers.get('authorization') || '';
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return request.headers.get('x-admin-token') || '';
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const token = String(extractToken(request) || '');
    if (!token) return json({ success: false, error: 'Missing token' }, 401);
    const user = await validateToken(env, token);
    if (!user) return json({ success: false, error: 'Invalid token' }, 401);
    return json({ success: true, data: user });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

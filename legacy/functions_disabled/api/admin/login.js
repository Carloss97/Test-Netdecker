import { authenticate } from '../../_shared/adminAuth.js';

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim();
    const password = String(body.password || '').trim();
    if (!email || !password) return json({ success: false, error: 'email and password required' }, 400);

    const storeId = body.storeId || null;
    const result = await authenticate(env, email, password, storeId);
    return json({ success: true, data: result });
  } catch (err) {
    return json({ success: false, error: String(err) }, 401);
  }
}

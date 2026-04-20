import { createUser } from '../../_shared/adminAuth.js';

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    // Protect via IMPORT_API_KEY if configured
    const expected = env.IMPORT_API_KEY;
    if (expected) {
      const key = request.headers.get('x-api-key') || '';
      if (!key || key !== expected) return json({ success: false, error: 'Missing or invalid API key' }, 401);
    }

    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim();
    const password = String(body.password || '').trim();
    const role = body.role === 'STAFF' ? 'STAFF' : 'ADMIN';
    if (!email || !password) return json({ success: false, error: 'email and password required' }, 400);

    const user = await createUser(env, email, password, role);
    return json({ success: true, data: user });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

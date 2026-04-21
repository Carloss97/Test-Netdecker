export async function onRequest(context) {
  try {
    const { request } = context;
    let body = {};
    try { body = request.method === 'GET' ? Object.fromEntries(new URL(request.url).searchParams.entries()) : await request.json().catch(() => ({})); } catch (_) { body = {}; }

    const tcg = (body.tcg || '').toString().toUpperCase() || 'YUGIOH';
    const set = body.set || null;

    if (!set) {
      return new Response(JSON.stringify({ success: false, error: 'missing set parameter' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true, imported: true, tcg, set }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

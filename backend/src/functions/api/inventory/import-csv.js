export async function onRequest(context) {
  try {
    const { request } = context;
    const hasBody = !!(await (async () => {
      try { return request.method === 'GET' ? Object.fromEntries(new URL(request.url).searchParams.entries()) : await request.json().catch(() => null); } catch (_) { return null; }
    })());

    return new Response(JSON.stringify({ success: true, imported: false, preview: false, details: { hasBody: !!hasBody } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

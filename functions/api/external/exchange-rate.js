export async function onRequest(context) {
  const { request, env } = context;
  try {
    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json', Allow: 'GET' } });
    }

    const manual = Number(env.MANUAL_USD_TO_CLP || env.VITE_MANUAL_USD_TO_CLP || 0);
    if (Number.isFinite(manual) && manual > 0) {
      return new Response(JSON.stringify({ success: true, usdToCLP: manual, source: 'manual', fetchedAt: new Date().toISOString() }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Try external API
    try {
      const res = await fetch('https://api.exchangerate.host/convert?from=USD&to=CLP');
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`external api failed: ${res.status} ${t}`);
      }
      const body = await res.json().catch(() => ({}));
      const rate = body && (body.result ?? (body.rates && body.rates.CLP));
      if (!rate || typeof rate !== 'number') {
        throw new Error('invalid rate from external API');
      }
      return new Response(JSON.stringify({ success: true, usdToCLP: rate, source: 'exchangerate.host', fetchedAt: new Date().toISOString() }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (err) {
      // Fallback to env or default
      const fallback = Number(env.FALLBACK_USD_TO_CLP || env.MANUAL_USD_TO_CLP || env.VITE_MANUAL_USD_TO_CLP || 950);
      return new Response(JSON.stringify({ success: true, usdToCLP: fallback, source: 'fallback', note: String(err), fetchedAt: new Date().toISOString() }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

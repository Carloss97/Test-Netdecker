export async function onRequest(context) {
  try {
    const target = 'https://db.ygoprodeck.com/api/v7/cardsets.php';
    const r = await fetch(target);
    const txt = await r.text();
    return new Response(txt, { status: r.status, headers: { 'Content-Type': r.headers.get('content-type') || 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

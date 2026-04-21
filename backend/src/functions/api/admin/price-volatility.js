const DEFAULT_SAMPLE = [
  { id: 'CARD-001', volatility: 0.12 },
  { id: 'CARD-002', volatility: 0.08 },
  { id: 'CARD-003', volatility: 0.03 },
];

export async function onRequest(context) {
  try {
    const { request } = context;
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit') || '20', 10)));
    const window = url.searchParams.get('window') || '7d';

    const data = DEFAULT_SAMPLE.slice(0, limit).map((d) => ({ id: d.id, volatility: d.volatility, window }));

    return new Response(JSON.stringify({ success: true, total: data.length, data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

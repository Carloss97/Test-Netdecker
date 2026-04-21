export async function onRequest(context) {
  try {
    const SAMPLE_LISTINGS = [
      { id: 'L-001', title: 'Blue-Eyes White Dragon (LP)', price: 120.0, qty: 1 },
      { id: 'L-002', title: 'Dark Magician (NM)', price: 45.0, qty: 2 },
    ];

    return new Response(JSON.stringify({ success: true, total: SAMPLE_LISTINGS.length, listings: SAMPLE_LISTINGS }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

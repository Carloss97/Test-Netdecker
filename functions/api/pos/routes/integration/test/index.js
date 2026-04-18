// Integration test stub for POS routes
export async function onRequest(context) {
  return new Response(JSON.stringify({ success: true, stub: 'pos.routes.integration.test' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export default onRequest;

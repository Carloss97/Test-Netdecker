// Integration test stub for inventory routes
export async function onRequest(context) {
  return new Response(JSON.stringify({ success: true, stub: 'inventory.routes.integration.test' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export default onRequest;

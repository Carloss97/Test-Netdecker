// Generic integration test stub
export async function onRequest(context) {
  return new Response(JSON.stringify({ success: true, stub: 'routes.integration.test' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export default onRequest;

// Lightweight test stub for admin.routes.test
export async function onRequest(context) {
  return new Response(JSON.stringify({ success: true, stub: 'admin.routes.test' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export default onRequest;

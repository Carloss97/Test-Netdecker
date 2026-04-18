// Test stub for payments webhook tests
export async function onRequest(context) {
  return new Response(JSON.stringify({ success: true, stub: 'payments.webhook.test' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export default onRequest;

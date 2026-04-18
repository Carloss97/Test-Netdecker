// Test stub for Stripe webhook tests
export async function onRequest(context) {
  return new Response(JSON.stringify({ success: true, stub: 'StripeWebhook.test' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export default onRequest;

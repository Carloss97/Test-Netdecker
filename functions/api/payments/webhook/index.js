import { pickDb, ensureSchema, firstRow } from '../../../_shared/d1.js';
import Orders from '../../../_shared/orders.js';

async function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const raw = await request.text().catch(() => '');

    // Attempt to parse JSON event; if parsing fails return 400
    let event = null;
    try { event = raw ? JSON.parse(raw) : null; } catch (_) { }

    // If nothing parseable, try to read as form/json via request.json()
    if (!event) {
      try { event = await request.json().catch(() => null); } catch (_) { event = null; }
    }

    if (!event || !event.type) return json({ received: true });

    // Only handle successful payment intents
    if (event.type !== 'payment_intent.succeeded') return json({ received: true });

    const intent = event.data?.object || event.data || event;
    const metadata = intent?.metadata || {};
    const itemsJson = metadata.items || metadata.Items || null;
    if (!itemsJson) return json({ received: true });

    let items;
    try { items = typeof itemsJson === 'string' ? JSON.parse(itemsJson) : itemsJson; } catch (err) {
      return json({ success: false, message: 'Invalid items metadata' }, 400);
    }

    const db = pickDb(env);
    if (!db) return json({ success: false, error: 'No DB binding available' }, 500);
    await ensureSchema(db);

    const paymentIntentId = intent.id || metadata.paymentIntentId || null;
    if (!paymentIntentId) return json({ received: true });

    // Idempotency: check existing order with notes = stripe_intent:<id>
    try {
      const ex = await db.prepare('SELECT id FROM "order" WHERE notes = ? LIMIT 1').bind(`stripe_intent:${paymentIntentId}`).all();
      const found = firstRow(ex);
      if (found && found.id) return json({ received: true, note: 'Already processed' });
    } catch (_) {}

    // Process the POS sale using Orders.processPosSale(db, input)
    try {
      await Orders.processPosSale(db, { items, storeId: metadata.storeId || null, paymentMethod: 'CARD', externalReference: `stripe_intent:${paymentIntentId}` });
      return json({ received: true });
    } catch (err) {
      return json({ success: false, message: String(err) }, 400);
    }
  } catch (err) {
    return json({ success: false, message: String(err) }, 500);
  }
}

export default onRequest;

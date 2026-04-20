import { pickDb, ensureSchema } from '../../../../_shared/d1.js';
import OrdersShared from '../../../../_shared/orders.js';

function hex(buf) {
  if (!buf) return '';
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function computeHmacSha256(secret, payload) {
  // Try Node crypto first
  try {
    const nodeCrypto = await import('crypto').then(m => m.default || m).catch(() => null);
    if (nodeCrypto && nodeCrypto.createHmac) {
      return nodeCrypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
    }
  } catch (_) {}

  // Fallback to WebCrypto
  try {
    const enc = new TextEncoder();
    const key = enc.encode(secret);
    const imported = await (globalThis.crypto.subtle || globalThis.crypto.webkitSubtle).importKey('raw', key, { name: 'HMAC', hash: { name: 'SHA-256' } }, false, ['sign']);
    const sig = await (globalThis.crypto.subtle || globalThis.crypto.webkitSubtle).sign('HMAC', imported, enc.encode(payload));
    return hex(new Uint8Array(sig));
  } catch (_) {
    return null;
  }
}

function constantTimeEqual(a, b) {
  try {
    if (!a || !b) return false;
    // Try Node timingSafeEqual
    try {
      const nodeCrypto = require && require('crypto');
      if (nodeCrypto && nodeCrypto.timingSafeEqual) {
        const A = Buffer.from(a, 'hex');
        const B = Buffer.from(b, 'hex');
        if (A.length !== B.length) return false;
        return nodeCrypto.timingSafeEqual(A, B);
      }
    } catch (_) {}
    if (a.length !== b.length) return false;
    let res = 0;
    for (let i = 0; i < a.length; i++) res |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return res === 0;
  } catch (_) { return false; }
}

async function verifyStripeSignature(header, payload, secret, toleranceSeconds = 300) {
  if (!header || !secret) return false;
  const parts = header.split(',').map(p => p.trim());
  let timestamp = null;
  const sigs = [];
  for (const p of parts) {
    if (p.startsWith('t=')) timestamp = p.slice(2);
    if (p.startsWith('v1=')) sigs.push(p.slice(3));
  }
  if (!timestamp || sigs.length === 0) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > toleranceSeconds) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const expected = await computeHmacSha256(secret, signedPayload);
  if (!expected) return false;
  for (const s of sigs) {
    if (constantTimeEqual(String(expected), String(s))) return true;
  }
  return false;
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    // Read raw body for signature verification
    const raw = await request.text().catch(() => '');

    const signingSecret = env.STRIPE_SIGNING_SECRET || env.VITE_STRIPE_SIGNING_SECRET || null;
    if (signingSecret) {
      const sigHeader = request.headers.get('stripe-signature') || request.headers.get('Stripe-Signature') || '';
      const ok = await verifyStripeSignature(sigHeader, raw, signingSecret);
      if (!ok) return new Response(JSON.stringify({ success: false, error: 'Invalid signature' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const event = raw ? JSON.parse(raw) : {};
    if (!event || event.type !== 'payment_intent.succeeded') return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    const intent = event.data && event.data.object ? event.data.object : null;
    if (!intent) return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    const itemsJson = intent.metadata?.items || intent.metadata?.Items || null;
    if (!itemsJson) return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    let items = [];
    try { items = JSON.parse(itemsJson); } catch (err) { return new Response(JSON.stringify({ success: false, message: 'Invalid items metadata' }), { status: 400, headers: { 'Content-Type': 'application/json' } }); }

    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    // Use metadata fields if present
    const storeId = intent.metadata?.storeId || null;
    const externalReference = `stripe_intent:${intent.id}`;

    await OrdersShared.processPosSale(db, { items, storeId, paymentMethod: 'CARD', externalReference });
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
}

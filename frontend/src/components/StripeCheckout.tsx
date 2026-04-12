import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { posCheckout, createStripePaymentIntent } from '../services/erp';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE as string);

function InnerStripeCheckout({ items, onSuccess, storeId }: { items: { listingId: string; quantity: number }[]; onSuccess?: () => void; storeId?: string | null }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!stripe || !elements) return setError('Stripe not loaded');

    setLoading(true);
    try {
      // Ask the backend (via ERP client) to create a PaymentIntent and return the clientSecret
      const resp = await createStripePaymentIntent({ items, storeId });
      const { clientSecret } = resp ?? {};
      if (!clientSecret) throw new Error('No clientSecret from server');

      const card = elements.getElement(CardElement);
      if (!card) throw new Error('Card element not found');

      const confirmResult = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card },
      });

      if (confirmResult.error) {
        throw confirmResult.error;
      }

      if (confirmResult.paymentIntent && confirmResult.paymentIntent.status === 'succeeded') {
        const pid = confirmResult.paymentIntent.id;
        // Call posCheckout to create order immediately (webhook will also be idempotent)
        await posCheckout({ items, paymentMethod: 'CARD', externalReference: `stripe_intent:${pid}` });
        onSuccess?.();
      }
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handlePay} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ padding: 12, border: '1px solid #ddd', borderRadius: 6 }}>
        <CardElement />
      </div>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <button disabled={!stripe || loading} type="submit">
        {loading ? 'Procesando…' : 'Pagar con tarjeta'}
      </button>
    </form>
  );
}

export default function StripeCheckout({ items, onSuccess, storeId }: { items: { listingId: string; quantity: number }[]; onSuccess?: () => void; storeId?: string | null }) {
  return (
    <Elements stripe={stripePromise}>
      <InnerStripeCheckout items={items} onSuccess={onSuccess} storeId={storeId} />
    </Elements>
  );
}

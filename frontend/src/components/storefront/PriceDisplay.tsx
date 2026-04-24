function formatClp(value: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(Math.max(0, value || 0));
}

export default function PriceDisplay({
  price,
  referencePrice,
}: {
  price: number;
  referencePrice?: number;
}) {
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.6 }}>{formatClp(price)}</div>
      {typeof referencePrice === 'number' && referencePrice > 0 && (
        <div style={{ color: 'var(--sf-text-muted)', fontSize: 12 }}>
          Referencia USD ${referencePrice.toFixed(2)}
        </div>
      )}
    </div>
  );
}

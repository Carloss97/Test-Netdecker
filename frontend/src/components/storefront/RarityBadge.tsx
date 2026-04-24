const RARITY_COLORS: Record<string, string> = {
  C: '#6b7280',
  U: '#2563eb',
  R: '#c2410c',
  M: '#7c3aed',
  SR: '#be185d',
};

export default function RarityBadge({ rarity }: { rarity: string }) {
  const normalized = (rarity || 'C').toUpperCase();
  const color = RARITY_COLORS[normalized] || '#475569';

  return (
    <span
      style={{
        background: `${color}22`,
        color,
        border: `1px solid ${color}66`,
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        padding: '4px 10px',
      }}
    >
      {normalized}
    </span>
  );
}

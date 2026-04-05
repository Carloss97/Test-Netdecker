import { useState } from 'react';
import { searchCards, searchCardsByCode, getListingsByCard, updateListingStock } from '../services/catalog';
import type { Card, Listing } from '../types';

const RARITY_BADGE: Record<string, string> = {
  common: 'badge-gray',
  uncommon: 'badge-blue',
  rare: 'badge-purple',
  mythic: 'badge-orange',
  legendary: 'badge-orange',
  'ultra rare': 'badge-orange',
  'secret rare': 'badge-yellow',
  'super rare': 'badge-purple',
  holo: 'badge-blue',
};

const CONDITION_BADGE: Record<string, string> = {
  NM: '#16a34a',
  LP: '#65a30d',
  MP: '#ca8a04',
  HP: '#ea580c',
  DMG: '#dc2626',
};

function getRarityBadge(rarity?: string): string {
  if (!rarity) return 'badge-gray';
  return RARITY_BADGE[rarity.toLowerCase()] ?? 'badge-gray';
}

function fmtCLP(n: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
}

interface CardWithListings extends Card {
  edition?: { id: string; editionCode: string; editionName: string };
  listings: Listing[];
  _listingsLoaded?: boolean;
}

export function CardSearchPage() {
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'name' | 'code'>('name');
  const [results, setResults] = useState<CardWithListings[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  // Image preview
  const [previewCard, setPreviewCard] = useState<{ name: string; imageUrl?: string } | null>(null);

  // Expanded listings per card id
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [loadingListings, setLoadingListings] = useState<string | null>(null);
  const [cardListings, setCardListings] = useState<Record<string, Listing[]>>({});
  const [updatingStockId, setUpdatingStockId] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    setResults([]);
    setSearched(true);
    setExpandedCard(null);
    setCardListings({});

    try {
      const data: CardWithListings[] =
        searchMode === 'code'
          ? await searchCardsByCode(q)
          : await searchCards(q, undefined, 50);
      setResults(data);
    } catch {
      setError('Error al buscar cartas. Revisa que el servidor esté activo.');
    } finally {
      setLoading(false);
    }
  };

  const toggleListings = async (card: CardWithListings) => {
    if (expandedCard === card.id) {
      setExpandedCard(null);
      return;
    }
    setExpandedCard(card.id);
    if (cardListings[card.id]) return; // already loaded

    setLoadingListings(card.id);
    try {
      const listings: Listing[] = await getListingsByCard(card.id);
      setCardListings((prev) => ({ ...prev, [card.id]: listings }));
    } catch {
      setCardListings((prev) => ({ ...prev, [card.id]: [] }));
    } finally {
      setLoadingListings(null);
    }
  };

  const adjustListingStock = async (cardId: string, listingId: string, delta: number) => {
    const currentListings = cardListings[cardId] ?? [];
    const current = currentListings.find((l) => l.id === listingId);
    if (!current) return;

    if (delta < 0 && current.quantity <= 0) return;

    setUpdatingStockId(listingId);
    try {
      const op = delta > 0 ? 'inc' : 'dec';
      const response = await updateListingStock(listingId, op, Math.abs(delta));
      setCardListings((prev) => ({
        ...prev,
        [cardId]: (prev[cardId] ?? []).map((listing) =>
          listing.id === listingId
            ? { ...listing, quantity: response.quantity }
            : listing,
        ),
      }));
    } catch {
      setError('No se pudo actualizar el stock del listing');
    } finally {
      setUpdatingStockId(null);
    }
  };

  // Group results by cardName for name searches so same card in different rarities are shown together
  const grouped: CardWithListings[][] = (() => {
    if (searchMode === 'code') {
      // For code search, each result is its own group
      return results.map((r) => [r]);
    }
    const map = new Map<string, CardWithListings[]>();
    for (const card of results) {
      const key = card.cardName.toLowerCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(card);
    }
    return Array.from(map.values());
  })();

  return (
    <div>
      {/* Image preview modal */}
      {previewCard && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setPreviewCard(null)}
        >
          <div
            style={{
              background: 'var(--surface)', borderRadius: 12, padding: 24,
              maxWidth: 480, width: '95%', textAlign: 'center',
              boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 600, marginBottom: 14, fontSize: '1.05rem' }}>
              {previewCard.name}
            </div>
            {previewCard.imageUrl ? (
              <img
                src={previewCard.imageUrl}
                alt={previewCard.name}
                style={{ maxWidth: '100%', borderRadius: 10, maxHeight: 520, objectFit: 'contain' }}
              />
            ) : (
              <div style={{ color: 'var(--text-muted)', padding: '60px 0', fontSize: '0.875rem' }}>
                Sin imagen disponible
              </div>
            )}
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginTop: 18 }}
              onClick={() => setPreviewCard(null)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Search form */}
      <div className="card" style={{ marginBottom: 20 }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 0, background: 'var(--surface-alt)', borderRadius: 6, overflow: 'hidden' }}>
              <button
                type="button"
                className={`btn btn-sm${searchMode === 'name' ? ' btn-primary' : ' btn-ghost'}`}
                style={{ borderRadius: 0 }}
                onClick={() => setSearchMode('name')}
              >
                Por nombre
              </button>
              <button
                type="button"
                className={`btn btn-sm${searchMode === 'code' ? ' btn-primary' : ' btn-ghost'}`}
                style={{ borderRadius: 0 }}
                onClick={() => setSearchMode('code')}
              >
                Por código
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              className="input"
              placeholder={
                searchMode === 'code'
                  ? 'Ingresa código de carta (ej: SV01-001)'
                  : 'Ingresa nombre de carta (ej: Charizard)'
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ flex: 1 }}
              autoFocus
            />
            <button type="submit" className="btn btn-primary" disabled={loading || !query.trim()}>
              {loading ? '⏳ Buscando…' : '🔍 Buscar'}
            </button>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {searchMode === 'code'
              ? 'Busca por código exacto o parcial. Muestra la carta en todas sus rarezas y condiciones de inventario.'
              : 'Busca por nombre (parcial). Muestra todas las ediciones, rarezas y listings.'}
          </div>
        </form>
      </div>

      {error && (
        <div className="error-message" style={{ marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {searched && !loading && results.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <h3>Sin resultados</h3>
          <p>No se encontraron cartas con ese {searchMode === 'code' ? 'código' : 'nombre'}</p>
        </div>
      )}

      {grouped.map((group) => {
        const first = group[0];
        return (
          <div key={first.id} className="card" style={{ marginBottom: 16 }}>
            {/* Card header */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              {/* Thumbnail */}
              {first.imageUrl && (
                <img
                  src={first.imageUrl}
                  alt={first.cardName}
                  title="Ver imagen"
                  onClick={() => setPreviewCard({ name: first.cardName, imageUrl: first.imageUrl })}
                  style={{
                    width: 72, height: 100, objectFit: 'cover', borderRadius: 6,
                    cursor: 'pointer', flexShrink: 0,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                    transition: 'transform 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                />
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 4 }}>
                  {first.cardName}
                </div>

                {/* Rarities row */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {group.map((card) => (
                    <span
                      key={card.id}
                      className={`badge ${getRarityBadge(card.rarity)}`}
                      title={`Código: ${card.cardCode} · Edición: ${card.edition?.editionName ?? ''}`}
                    >
                      {card.rarity ?? 'Sin rareza'}
                    </span>
                  ))}
                </div>

                {/* Edition & code info for each variant */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {group.map((card) => (
                    <div key={card.id} style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span>
                        📦 {card.edition?.editionName ?? 'Edición desconocida'}
                        {card.edition?.editionCode && (
                          <span style={{ marginLeft: 4, opacity: 0.65 }}>({card.edition.editionCode})</span>
                        )}
                      </span>
                      <span>🔖 {card.cardCode}</span>
                      {card.cardNumber && <span>#{card.cardNumber}</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Toggle listings button */}
              <button
                className="btn btn-secondary btn-sm"
                style={{ flexShrink: 0 }}
                onClick={() => toggleListings(first)}
              >
                {expandedCard === first.id ? '▲ Ocultar' : '▼ Ver listings'}
              </button>
            </div>

            {/* Listings table */}
            {expandedCard === first.id && (
              <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                {loadingListings === first.id ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>⏳ Cargando listings…</div>
                ) : (cardListings[first.id] ?? []).length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Sin listings en inventario</div>
                ) : (
                  <table className="data-table" style={{ fontSize: '0.82rem' }}>
                    <thead>
                      <tr>
                        <th>Rareza</th>
                        <th>Condición</th>
                        <th>Stock</th>
                        <th>Precio USD</th>
                        <th>Precio CLP</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(cardListings[first.id] ?? []).map((listing) => (
                        <tr key={listing.id}>
                          <td>
                            <span className={`badge ${getRarityBadge(listing.card?.rarity)}`}>
                              {listing.card?.rarity ?? '—'}
                            </span>
                          </td>
                          <td>
                            <span
                              style={{
                                fontWeight: 600,
                                color: CONDITION_BADGE[listing.condition] ?? 'var(--text)',
                                fontSize: '0.8rem',
                              }}
                            >
                              {listing.condition}
                            </span>
                          </td>
                          <td style={{ fontWeight: listing.quantity === 0 ? 400 : 600 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ padding: '1px 6px', minWidth: 24, fontWeight: 700 }}
                                disabled={updatingStockId === listing.id || listing.quantity <= 0}
                                title="Reducir stock"
                                onClick={() => adjustListingStock(first.id, listing.id, -1)}
                              >
                                −
                              </button>
                              <span style={{ color: listing.quantity === 0 ? 'var(--text-muted)' : listing.quantity <= 2 ? '#dc2626' : 'var(--text)' }}>
                                {listing.quantity}
                              </span>
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ padding: '1px 6px', minWidth: 24, fontWeight: 700 }}
                                disabled={updatingStockId === listing.id}
                                title="Aumentar stock"
                                onClick={() => adjustListingStock(first.id, listing.id, +1)}
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td>{listing.referencePrice ? `$${listing.referencePrice.toFixed(2)}` : '—'}</td>
                          <td style={{ fontWeight: 500 }}>{listing.finalPrice ? fmtCLP(listing.finalPrice) : '—'}</td>
                          <td>
                            <span className={`badge ${listing.status === 'active' ? 'badge-blue' : 'badge-gray'}`}>
                              {listing.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        );
      })}

      {grouped.length > 0 && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>
          {results.length} carta(s) encontrada(s)
        </div>
      )}
    </div>
  );
}

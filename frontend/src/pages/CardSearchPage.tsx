import { useEffect, useState } from 'react';
import { searchCards, searchCardsByCode, getListingsByCard, updateListingPricingMode, updateListingStock } from '../services/catalog';
import type { Card, Listing } from '../types';
import { parsePositiveNumberInput } from '../constants/pricing';
import { formatInventoryIdentifier } from '../utils/cardIdentifier';

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


function getRarityBadge(rarity?: string): string {
  if (!rarity) return 'badge-gray';
  return RARITY_BADGE[rarity.toLowerCase()] ?? 'badge-gray';
}

function fmtCLP(n: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
}

function ModeToggle({
  checked,
  disabled,
  onToggle,
  onLabel,
  offLabel,
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onLabel: string;
  offLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      title={checked ? `Cambiar a ${offLabel}` : `Cambiar a ${onLabel}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        border: 'none',
        background: 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: 0,
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'relative',
          width: 46,
          height: 24,
          borderRadius: 999,
          background: checked ? 'linear-gradient(135deg, #16a34a, #22c55e)' : '#cbd5e1',
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
          transition: 'background 0.15s ease',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 3,
            left: checked ? 23 : 3,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
            transition: 'left 0.15s ease',
          }}
        />
      </span>
      {/* Remove label text for toggle */}
      <span style={{ display: 'none' }} />
    </button>
  );
}

interface CardWithListings extends Card {
  edition?: { id: string; editionCode: string; editionName: string };
  listings: Listing[];
  _listingsLoaded?: boolean;
}

interface PreviewCard {
  name: string;
  imageUrl?: string;
  cardCode?: string;
  editionName?: string;
  rarity?: string;
}

export function CardSearchPage() {
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'name' | 'code'>('name');
  const [results, setResults] = useState<CardWithListings[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  // Image preview
  const [previewCard, setPreviewCard] = useState<PreviewCard | null>(null);

  // Expanded listings per card id
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [loadingListings, setLoadingListings] = useState<string | null>(null);
  const [cardListings, setCardListings] = useState<Record<string, Listing[]>>({});
  const [updatingPricingId, setUpdatingPricingId] = useState<string | null>(null);
  const [manualPriceDrafts, setManualPriceDrafts] = useState<Record<string, string>>({});
  const [listingFilter, setListingFilter] = useState('');
  const [listingSort, setListingSort] = useState<'rarity' | 'condition' | 'stock' | 'usd' | 'clp' | 'mode'>('stock');
  const [listingSortDir, setListingSortDir] = useState<'asc' | 'desc'>('desc');
  const [updatingStockId, setUpdatingStockId] = useState<string | null>(null);
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({});

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

  useEffect(() => {
    const nextPreview = results.find((card) => card.imageUrl) ?? results[0] ?? null;

    if (!nextPreview) {
      setPreviewCard(null);
      return;
    }

    setPreviewCard({
      name: nextPreview.cardName,
      imageUrl: nextPreview.imageUrl,
      cardCode: nextPreview.cardCode,
      editionName: nextPreview.edition?.editionName,
      rarity: nextPreview.rarity,
    });
  }, [results]);

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


  const setPricingMode = async (cardId: string, listing: Listing, mode: 'manual' | 'api') => {
    setUpdatingPricingId(listing.id);
    try {
      if (mode === 'manual') {
        const rawDraft = manualPriceDrafts[listing.id] ?? String(Math.round(listing.finalPrice || 0));
        const manualPrice = parsePositiveNumberInput(rawDraft);
        if (!manualPrice) {
          setError('Ingresa un precio final en CLP valido (> 0). El precio de referencia USD se muestra aparte.');
          return false;
        }
        await updateListingPricingMode(listing.id, 'manual', manualPrice);
      } else {
        await updateListingPricingMode(listing.id, 'api');
      }

      setCardListings((prev) => ({
        ...prev,
        [cardId]: (prev[cardId] ?? []).map((row) =>
          row.id === listing.id
            ? {
                ...row,
                status: mode === 'manual' ? 'manual' : 'active',
                finalPrice: mode === 'manual'
                  ? Number(manualPriceDrafts[listing.id] ?? Math.round(row.finalPrice || 0))
                  : row.finalPrice,
              }
            : row,
        ),
      }));

      const refreshed = await getListingsByCard(cardId);
      setCardListings((prev) => ({ ...prev, [cardId]: refreshed }));
      return true;
    } catch {
      setError('No se pudo actualizar el modo de precio del listing');
      return false;
    } finally {
      setUpdatingPricingId(null);
    }
  };

  const setListingStock = async (cardId: string, listing: Listing, nextQuantity: number) => {
    setUpdatingStockId(listing.id);
    setError(null);

    try {
      const response = await updateListingStock(listing.id, 'set', nextQuantity);
      setCardListings((prev) => ({
        ...prev,
        [cardId]: (prev[cardId] ?? []).map((row) =>
          row.id === listing.id ? { ...row, quantity: response.quantity } : row,
        ),
      }));

      setStockDrafts((prev) => {
        const next = { ...prev };
        delete next[listing.id];
        return next;
      });

      return true;
    } catch {
      setError('No se pudo actualizar el stock del listing');
      return false;
    } finally {
      setUpdatingStockId(null);
    }
  };

  const commitStockDraft = async (cardId: string, listing: Listing) => {
    const rawDraft = stockDrafts[listing.id] ?? String(listing.quantity);
    const parsed = Number.parseInt(rawDraft, 10);

    if (!Number.isFinite(parsed) || parsed < 0) {
      setError('Ingresa un stock valido (0 o mayor).');
      return;
    }

    await setListingStock(cardId, listing, parsed);
  };

  const bumpStock = async (cardId: string, listing: Listing, delta: number) => {
    const nextQuantity = Math.max(0, listing.quantity + delta);
    await setListingStock(cardId, listing, nextQuantity);
  };

  const saveManualPrice = async (cardId: string, listing: Listing) => {
    if (listing.status !== 'manual' || updatingPricingId === listing.id) return;
    return setPricingMode(cardId, listing, 'manual');
  };

  const toggleListingSort = (column: 'rarity' | 'condition' | 'stock' | 'usd' | 'clp' | 'mode') => {
    if (listingSort === column) {
      setListingSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setListingSort(column);
    setListingSortDir('asc');
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

      {previewCard && (
        <div className="card" style={{ marginBottom: 20, display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <div
            style={{
              width: 220,
              maxWidth: '100%',
              aspectRatio: '5 / 7',
              borderRadius: 12,
              overflow: 'hidden',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {previewCard.imageUrl ? (
              <img
                src={previewCard.imageUrl}
                alt={previewCard.name}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', padding: 16, textAlign: 'center' }}>
                Sin imagen disponible
              </div>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 6 }}>
              Vista previa
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: 6 }}>
              {previewCard.name}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {previewCard.cardCode && <span className="badge badge-blue">{previewCard.cardCode}</span>}
              {previewCard.editionName && <span className="badge badge-gray">{previewCard.editionName}</span>}
              {previewCard.rarity && <span className={`badge ${getRarityBadge(previewCard.rarity)}`}>{previewCard.rarity}</span>}
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: 1.5 }}>
              Pasa el mouse por una carta para actualizar la vista. También puedes fijar una carta concreta haciendo clic en su miniatura.
            </p>
          </div>
        </div>
      )}

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
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }} onMouseEnter={() => {
              setPreviewCard({
                name: first.cardName,
                imageUrl: first.imageUrl,
                cardCode: first.cardCode,
                editionName: first.edition?.editionName,
                rarity: first.rarity,
              });
            }}>
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
                  <>
                    <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        className="input input-sm"
                        style={{ maxWidth: 280 }}
                        value={listingFilter}
                        onChange={(e) => setListingFilter(e.target.value)}
                        placeholder="Filtrar listings por rareza/código"
                      />
                    </div>
                    <table className="data-table" style={{ fontSize: '0.82rem', tableLayout: 'fixed' }}>
                      <colgroup>
                        <col style={{ width: '16%' }} />
                        <col style={{ width: '24%' }} />
                        <col style={{ width: '14%' }} />
                        <col style={{ width: '20%' }} />
                        <col style={{ width: '20%' }} />
                        <col style={{ width: '14%' }} />
                        <col style={{ width: '8%' }} />
                      </colgroup>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th style={{ cursor: 'pointer' }} onClick={() => toggleListingSort('rarity')}>Rareza {listingSort === 'rarity' ? (listingSortDir === 'asc' ? '↑' : '↓') : ''}</th>
                        <th>Código</th>
                        <th style={{ cursor: 'pointer' }} onClick={() => toggleListingSort('stock')}>Stock {listingSort === 'stock' ? (listingSortDir === 'asc' ? '↑' : '↓') : ''}</th>
                        <th style={{ cursor: 'pointer' }} onClick={() => toggleListingSort('usd')}>Precio USD {listingSort === 'usd' ? (listingSortDir === 'asc' ? '↑' : '↓') : ''}</th>
                        <th style={{ cursor: 'pointer' }} onClick={() => toggleListingSort('clp')}>Precio CLP {listingSort === 'clp' ? (listingSortDir === 'asc' ? '↑' : '↓') : ''}</th>
                        <th style={{ cursor: 'pointer' }} onClick={() => toggleListingSort('mode')}>Modo {listingSort === 'mode' ? (listingSortDir === 'asc' ? '↑' : '↓') : ''}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(cardListings[first.id] ?? [])
                        .filter((listing) => {
                          const q = listingFilter.trim().toLowerCase();
                          if (!q) return true;
                          return (
                            (listing.card?.rarity ?? '').toLowerCase().includes(q)
                            || (listing.card?.cardCode ?? '').toLowerCase().includes(q)
                          );
                        })
                        .sort((a, b) => {
                          const mult = listingSortDir === 'asc' ? 1 : -1;
                          switch (listingSort) {
                            case 'rarity':
                              return mult * (a.card?.rarity ?? '').localeCompare(b.card?.rarity ?? '');
                            case 'stock':
                              return mult * (a.quantity - b.quantity);
                            case 'usd':
                              return mult * ((a.referencePrice ?? 0) - (b.referencePrice ?? 0));
                            case 'clp':
                              return mult * ((a.finalPrice ?? 0) - (b.finalPrice ?? 0));
                            case 'mode': {
                              const aMode = a.status === 'manual' ? 'manual' : 'api';
                              const bMode = b.status === 'manual' ? 'manual' : 'api';
                              return mult * aMode.localeCompare(bMode);
                            }
                            default:
                              return 0;
                          }
                        })
                        .map((listing) => {
                          const isManual = listing.status === 'manual';
                          const draft = manualPriceDrafts[listing.id] ?? String(Math.round(listing.finalPrice || 0));
                          const stockDraft = stockDrafts[listing.id] ?? String(listing.quantity);
                          return (
                            <tr key={listing.id}>
                              <td>
                                <span style={{ fontWeight: 600 }}>{formatInventoryIdentifier({
                                  editionCode: (listing.card as Listing['card'] & { edition?: { editionCode?: string } })?.edition?.editionCode ?? first.edition?.editionCode,
                                  cardCode: listing.card?.cardCode,
                                  cardNumber: listing.card?.cardNumber,
                                  cardName: listing.card?.cardName,
                                })}</span>
                              </td>
                              <td>
                                <span className={`badge ${getRarityBadge(listing.card?.rarity)}`}>
                                  {listing.card?.rarity ?? '—'}
                                </span>
                              </td>
                              <td>
                                <span style={{ fontWeight: 600 }}>{listing.card?.cardCode ?? '—'}</span>
                              </td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    style={{ padding: '1px 6px', minWidth: 24, fontWeight: 700 }}
                                    title="Reducir stock"
                                    disabled={updatingStockId === listing.id}
                                    onClick={() => { void bumpStock(first.id, listing, -1); }}
                                  >
                                    −
                                  </button>
                                  <input
                                    type="number"
                                    min={0}
                                    className="input input-sm"
                                    value={stockDraft}
                                    disabled={updatingStockId === listing.id}
                                    title="Editar stock"
                                    onChange={(e) => setStockDrafts((prev) => ({ ...prev, [listing.id]: e.target.value }))}
                                    onBlur={() => { void commitStockDraft(first.id, listing); }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        void commitStockDraft(first.id, listing);
                                      }
                                    }}
                                    style={{ width: 74, textAlign: 'center' }}
                                  />
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    style={{ padding: '1px 6px', minWidth: 24, fontWeight: 700 }}
                                    title="Aumentar stock"
                                    disabled={updatingStockId === listing.id}
                                    onClick={() => { void bumpStock(first.id, listing, +1); }}
                                  >
                                    +
                                  </button>
                                </div>
                              </td>
                              <td>{listing.referencePrice ? `$${listing.referencePrice.toFixed(2)}` : '—'}</td>
                              <td style={{ fontWeight: 500 }}>
                                {isManual ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ fontWeight: 600, color: '#16a34a', fontSize: '0.8em' }}>CLP</span>
                                    <input
                                      type="number"
                                      className="input input-sm"
                                      value={draft}
                                      onChange={(e) => setManualPriceDrafts((prev) => ({ ...prev, [listing.id]: e.target.value }))}
                                      style={{ width: 90, fontSize: '1em', padding: '4px 8px' }}
                                      disabled={updatingPricingId === listing.id}
                                      title="Precio final manual en CLP"
                                      placeholder="Final CLP"
                                      onBlur={() => { void saveManualPrice(first.id, listing); }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          void saveManualPrice(first.id, listing);
                                        }
                                      }}
                                    />
                                  </div>
                                ) : (
                                  listing.finalPrice != null ? fmtCLP(listing.finalPrice) : '—'
                                )}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <ModeToggle
                                  checked={isManual}
                                  disabled={updatingPricingId === listing.id}
                                  onToggle={() => {
                                    if (!isManual) {
                                      setManualPriceDrafts((prev) => ({
                                        ...prev,
                                        [listing.id]: prev[listing.id] ?? String(Math.round(listing.finalPrice || 0)),
                                      }));
                                      void setPricingMode(first.id, listing, 'manual');
                                    } else {
                                      void setPricingMode(first.id, listing, 'api');
                                    }
                                  }}
                                  onLabel="modo manual"
                                  offLabel="modo api"
                                />
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                  </>
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

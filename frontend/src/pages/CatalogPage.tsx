import { useEffect, useRef, useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import { getAvailableListings } from '../services/catalog';
import type { Listing } from '../types';
import { formatInventoryIdentifier } from '../utils/cardIdentifier';

// Redondea al múltiplo de 100 más cercano, mínimo 100 (consistente con PricingPage)
function roundToNearestHundred(price: number): number {
  if (price <= 0) return 0;
  if (price <= 100) return 100;
  const remainder = price % 100;
  if (remainder === 0) return price;
  if (remainder < 50) return price - remainder;
  return price + (100 - remainder);
}

export function CatalogPage() {
  type TcgFilter = 'ALL' | 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ';
  const [selectedTcg, setSelectedTcg] = useState<TcgFilter>('ALL');
  const [listingSearch, setListingSearch] = useState('');
  const [sortColumn, setSortColumn] = useState<'name' | 'code' | 'stock' | 'price'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [previewListingId, setPreviewListingId] = useState<string | null>(null);
  const [pinnedPreviewListingId, setPinnedPreviewListingId] = useState<string | null>(null);

  const { data: listings, status: listingsStatus, error: listingsError } = useAsync<Listing[]>(
    () => getAvailableListings()
  );

  const activeListings = (listings ?? []).filter((l) => l.quantity > 0);
  
  const filteredListings = activeListings.filter((l) => {
    const tcgName = (l as any).tcgName || (l.card as any)?.tcg?.name;
    if (selectedTcg !== 'ALL' && tcgName !== selectedTcg) return false;
    
    const q = listingSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      (l.card?.cardName ?? '').toLowerCase().includes(q)
      || (l.card?.cardCode ?? '').toLowerCase().includes(q)
    );
  });

  const sortedListings = [...filteredListings].sort((a, b) => {
    const mult = sortDirection === 'asc' ? 1 : -1;
    switch (sortColumn) {
      case 'name':
        return mult * (a.card?.cardName ?? '').localeCompare(b.card?.cardName ?? '');
      case 'code':
        return mult * (a.card?.cardCode ?? '').localeCompare(b.card?.cardCode ?? '');
      case 'stock':
        return mult * (a.quantity - b.quantity);
      case 'price':
        return mult * ((a.finalPrice ?? 0) - (b.finalPrice ?? 0));
      default:
        return 0;
    }
  });

  const previewListing = sortedListings.find((listing) => listing.id === previewListingId) ?? sortedListings[0] ?? null;
  const isPreviewPinned = pinnedPreviewListingId !== null;

  const fmtCLP = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(roundToNearestHundred(n));

  const toggleSort = (column: typeof sortColumn) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortColumn(column);
    setSortDirection('asc');
  };

  return (
    <div className="catalog-page">
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="input input-sm"
            style={{ minWidth: 250 }}
            value={listingSearch}
            onChange={(e) => setListingSearch(e.target.value)}
            placeholder="Buscar por nombre o código..."
          />
          <div className="btn-group">
            {(['ALL', 'MAGIC', 'POKEMON', 'YUGIOH', 'ONE_PIECE', 'DIGIMON', 'WEISS_SCHWARZ'] as const).map((tcg) => (
              <button
                key={tcg}
                className={`btn btn-sm ${selectedTcg === tcg ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSelectedTcg(tcg)}
              >
                {tcg}
              </button>
            ))}
          </div>
        </div>
      </div>

      {listingsStatus === 'pending' ? (
        <div className="loading-spinner">Cargando catálogo...</div>
      ) : listingsStatus === 'error' ? (
        <div className="error-message">Error: {listingsError?.message}</div>
      ) : (
        <div className="listings-preview-pane">
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('name')}>Carta</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('code')}>Código</th>
                  <th>Edición</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('stock')}>Stock</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('price')}>Precio</th>
                </tr>
              </thead>
              <tbody>
                {sortedListings.map((listing) => (
                  <tr 
                    key={listing.id} 
                    onMouseEnter={() => !isPreviewPinned && setPreviewListingId(listing.id)}
                    onClick={() => setPinnedPreviewListingId(pinnedPreviewListingId === listing.id ? null : listing.id)}
                    className={previewListing?.id === listing.id ? 'row-preview-active' : ''}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>{listing.card?.cardName}</td>
                    <td><code style={{ fontWeight: 600 }}>{listing.card?.cardCode}</code></td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {(listing as any).editionName || (listing.card as any)?.edition?.editionName || '—'}
                    </td>
                    <td>
                      <span className={`badge ${listing.quantity > 5 ? 'badge-green' : 'badge-yellow'}`}>
                        {listing.quantity} uds
                      </span>
                    </td>
                    <td style={{ fontWeight: 700 }}>{fmtCLP(listing.finalPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <aside className="inventory-preview-panel">
            {previewListing ? (
              <>
                <div className="inventory-preview-frame">
                  <img src={previewListing.card?.imageUrl} alt={previewListing.card?.cardName} className="inventory-preview-image" />
                </div>
                <div style={{ marginTop: 15 }}>
                  <h3 style={{ margin: 0 }}>{previewListing.card?.cardName}</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{previewListing.card?.cardCode}</p>
                  <div style={{ marginTop: 10 }}>
                    <span className="badge badge-gray">{previewListing.card?.rarity}</span>
                    <span className="badge badge-blue" style={{ marginLeft: 5 }}>{(previewListing as any).tcgName || 'TCG'}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-state">Selecciona una carta</div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

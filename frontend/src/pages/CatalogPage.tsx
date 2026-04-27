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
  
  const filteredListings = activeListings.filter((l: any) => {
    const tcgName = l.tcgName || l.card?.tcg?.name;
    if (selectedTcg !== 'ALL' && tcgName !== selectedTcg) return false;
    
    const q = listingSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      (l.cardName || l.card?.cardName || '').toLowerCase().includes(q)
      || (l.cardCode || l.card?.cardCode || '').toLowerCase().includes(q)
    );
  });

  const sortedListings = [...filteredListings].sort((a: any, b: any) => {
    const mult = sortDirection === 'asc' ? 1 : -1;
    switch (sortColumn) {
      case 'name':
        return mult * (a.cardName || a.card?.cardName || '').localeCompare(b.cardName || b.card?.cardName || '');
      case 'code':
        return mult * (a.cardCode || a.card?.cardCode || '').localeCompare(b.cardCode || b.card?.cardCode || '');
      case 'stock':
        return mult * (a.quantity - b.quantity);
      case 'price':
        return mult * ((a.finalPrice ?? 0) - (b.finalPrice ?? 0));
      default:
        return 0;
    }
  });

  const previewListing: any = sortedListings.find((listing) => listing.id === previewListingId) ?? sortedListings[0] ?? null;
  const isPreviewPinned = pinnedPreviewListingId !== null;

  const fmtCLP = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  const toggleSort = (column: typeof sortColumn) => {

    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortColumn(column);
    setSortDirection('asc');
  };

  return (
    <div className="catalog-page" style={{ width: '100%', maxWidth: '1400px', margin: '0 auto', padding: '0 20px' }}>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="input input-sm"
            style={{ minWidth: 350 }}
            value={listingSearch}
            onChange={(e) => setListingSearch(e.target.value)}
            placeholder="Buscar por nombre o código de carta..."
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
        <div className="listings-preview-pane" style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: 24, alignItems: 'start' }}>
          <div className="table-wrapper card" style={{ padding: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer', paddingLeft: 16 }} onClick={() => toggleSort('name')}>Carta</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('code')}>Código</th>
                  <th>Edición</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('stock')}>Stock</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('price')}>Precio</th>
                </tr>
              </thead>
              <tbody>
                {sortedListings.map((listing: any) => (
                  <tr 
                    key={listing.id} 
                    onMouseEnter={() => !isPreviewPinned && setPreviewListingId(listing.id)}
                    onClick={() => setPinnedPreviewListingId(pinnedPreviewListingId === listing.id ? null : listing.id)}
                    className={previewListing?.id === listing.id ? 'row-preview-active' : ''}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ paddingLeft: 16, fontWeight: 500 }}>{listing.cardName || listing.card?.cardName}</td>
                    <td><code style={{ fontWeight: 600, color: 'var(--primary)' }}>{listing.cardCode || listing.card?.cardCode}</code></td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {listing.editionName || listing.card?.edition?.editionName || '—'}
                    </td>
                    <td>
                      <span className={`badge ${listing.quantity > 5 ? 'badge-green' : 'badge-yellow'}`}>
                        {listing.quantity} uds
                      </span>
                    </td>
                    <td style={{ fontWeight: 700, fontSize: '1rem' }}>{fmtCLP(listing.finalPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <aside className="inventory-preview-panel card" style={{ position: 'sticky', top: 20, padding: 20 }}>
            {previewListing ? (
              <>
                <div className="inventory-preview-frame" style={{ background: '#000', borderRadius: 12, overflow: 'hidden', aspectRation: '2.5/3.5' }}>
                  <img 
                    src={previewListing.imageUrl || previewListing.card?.imageUrl} 
                    alt="" 
                    className="inventory-preview-image" 
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                </div>
                <div style={{ marginTop: 20 }}>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '1.25rem' }}>{previewListing.cardName || previewListing.card?.cardName}</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', margin: 0 }}>{previewListing.cardCode || previewListing.card?.cardCode}</p>
                  
                  <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <span className="badge badge-gray">{previewListing.rarity || previewListing.card?.rarity}</span>
                    <span className="badge badge-blue">{previewListing.tcgName || 'TCG'}</span>
                    <span className="badge badge-green">{previewListing.condition}</span>
                  </div>

                  <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Precio Final:</span>
                      <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)' }}>{fmtCLP(previewListing.finalPrice)}</span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-state" style={{ padding: '40px 0' }}>Selecciona una carta para ver detalles</div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

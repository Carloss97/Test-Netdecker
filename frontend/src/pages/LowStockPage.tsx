import { useEffect, useState } from 'react';
import { getLowStockListings } from '../services/catalog';
import type { Listing } from '../types';
import { formatInventoryIdentifier } from '../utils/cardIdentifier';

export function LowStockPage() {
  type TcgFilter = 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ';
  const [selectedTcg, setSelectedTcg] = useState<TcgFilter>('MAGIC');
  const [thresholdInput, setThresholdInput] = useState('5');
  const [threshold, setThreshold] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [previewListingId, setPreviewListingId] = useState<string | null>(null);
  const [pinnedPreviewListingId, setPinnedPreviewListingId] = useState<string | null>(null);

  const filteredListings = listings.filter((l: any) => {
    const tcgName = l.tcgName || l.card?.tcg?.name;
    return tcgName === selectedTcg;
  });
  const [activeStore, setActiveStore] = useState(() => {
    try {
      return window.localStorage.getItem('auth_store') || 'sin tienda activa';
    } catch {
      return 'sin tienda activa';
    }
  });

  const fmtCLP = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  const loadLowStock = async (nextThreshold: number) => {
    setLoading(true);
    setError(null);

    try {
      const data = await getLowStockListings(nextThreshold);
      setListings(data || []);
    } catch (err) {
      setError((err as Error).message || 'No se pudo cargar el listado de stock bajo');
      setListings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLowStock(threshold);
  }, [threshold]);

  useEffect(() => {
    const refreshStore = () => {
      try {
        setActiveStore(window.localStorage.getItem('auth_store') || 'sin tienda activa');
      } catch {
        setActiveStore('sin tienda activa');
      }
    };

    window.addEventListener('storage', refreshStore);
    window.addEventListener('netdecker:store-changed', refreshStore as EventListener);
    return () => {
      window.removeEventListener('storage', refreshStore);
      window.removeEventListener('netdecker:store-changed', refreshStore as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!listings.length) {
      setPreviewListingId(null);
      setPinnedPreviewListingId(null);
      return;
    }

    setPreviewListingId((currentId) => {
      if (currentId && listings.some((listing) => listing.id === currentId)) {
        return currentId;
      }
      return listings[0].id;
    });

    setPinnedPreviewListingId((currentId) => {
      if (!currentId) return null;
      return listings.some((listing) => listing.id === currentId) ? currentId : null;
    });
  }, [listings]);

  const previewListing = listings.find((listing) => listing.id === previewListingId) ?? listings[0] ?? null;
  const isPreviewPinned = pinnedPreviewListingId !== null;

  const setHoveredPreviewListing = (listingId: string) => {
    if (isPreviewPinned) return;
    setPreviewListingId(listingId);
  };

  const togglePinnedPreviewListing = (listingId: string) => {
    setPreviewListingId(listingId);
    setPinnedPreviewListingId((currentId) => (currentId === listingId ? null : listingId));
  };

  const clearPinnedPreviewListing = () => {
    setPinnedPreviewListingId(null);
  };

  const onApplyThreshold = () => {
    const parsed = Number.parseInt(thresholdInput, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setError('El umbral debe ser un numero entero mayor o igual a 1.');
      return;
    }

    setThreshold(parsed);
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title" style={{ marginBottom: 8 }}>Alertas de Stock Bajo</div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
          Lista de listings activos con cantidad menor o igual al umbral definido.
        </p>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="btn-group">
            {(['MAGIC', 'POKEMON', 'YUGIOH', 'ONE_PIECE', 'DIGIMON', 'WEISS_SCHWARZ'] as const).map((tcg) => (
              <button
                key={tcg}
                className={`btn btn-sm ${selectedTcg === tcg ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSelectedTcg(tcg)}
              >
                {tcg}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label htmlFor="low-stock-threshold" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Umbral
            </label>
            <input
              id="low-stock-threshold"
              type="number"
              min="1"
              className="input"
              style={{ width: 110 }}
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
            />
            <button type="button" className="btn btn-primary" onClick={onApplyThreshold} disabled={loading}>
              Aplicar
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="loading-spinner">
          <span>⏳</span> Cargando stock bajo...
        </div>
      )}

      {!loading && error && (
        <div className="error-message">
          ⚠️ Error al cargar stock bajo: {error}
        </div>
      )}

      {!loading && !error && filteredListings.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">✅</div>
          <h3>Sin alertas para {selectedTcg}</h3>
          <p>No hay listings activos con stock menor o igual a {threshold} en {selectedTcg}.</p>
        </div>
      )}

      {!loading && !error && filteredListings.length > 0 && (
        <div className="card">
          <div className="section-title" style={{ marginBottom: 12 }}>
            {filteredListings.length} listing(s) en alerta (umbral: {threshold})
          </div>
          <div className="listings-preview-pane" style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: 24, alignItems: 'start' }}>
            <div className="table-wrapper listings-preview-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Carta</th>
                    <th>Stock</th>
                    <th>Precio CLP</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredListings.map((listing) => {
                    const isActivePreview = previewListing?.id === listing.id;
                    return (
                      <tr
                        key={listing.id}
                        className={isActivePreview ? 'row-preview-active' : ''}
                        onMouseEnter={() => setHoveredPreviewListing(listing.id)}
                        onClick={() => togglePinnedPreviewListing(listing.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <div style={{ fontWeight: 600 }}>{listing.card?.cardName}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {listing.card?.cardCode} · {listing.card?.rarity}
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${listing.quantity <= 2 ? 'badge-red' : 'badge-yellow'}`}>
                            {listing.quantity} uds
                          </span>
                        </td>
                        <td style={{ fontWeight: 700 }}>{fmtCLP(listing.finalPrice || 0)}</td>
                        <td>
                          <span className={`badge ${listing.status === 'manual' ? 'badge-purple' : 'badge-blue'}`}>
                            {listing.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <aside className="inventory-preview-panel card" style={{ position: 'sticky', top: 20, padding: 20 }}>
              <div className="flex items-center justify-between gap-2" style={{ marginBottom: 10 }}>
                <div className="section-title">Vista previa</div>
                {previewListing && isPreviewPinned && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={clearPinnedPreviewListing}
                    title="Liberar vista previa fija"
                  >
                    Fijada
                  </button>
                )}
              </div>

              {previewListing ? (
                <>
                  {isPreviewPinned && (
                    <div className="badge badge-gray" style={{ marginBottom: 10 }}>
                      Vista fija: el hover no cambia la carta
                    </div>
                  )}
                  <div className="inventory-preview-frame">
                    {previewListing.card?.imageUrl ? (
                      <img
                        src={previewListing.card.imageUrl}
                        alt={previewListing.card?.cardName || 'Carta'}
                        className="inventory-preview-image"
                      />
                    ) : (
                      <div className="inventory-preview-empty">Sin imagen disponible</div>
                    )}
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>
                      {previewListing.card?.cardName || 'Sin nombre'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                      {previewListing.card?.cardCode || '—'}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                      {previewListing.card?.rarity ? (
                        <span className="badge badge-gray">{previewListing.card.rarity}</span>
                      ) : null}
                      <span className="badge badge-gray">
                        {formatInventoryIdentifier({
                          editionCode: (previewListing.card as Listing['card'] & { edition?: { editionCode?: string } })?.edition?.editionCode,
                          cardCode: previewListing.card?.cardCode,
                          cardNumber: previewListing.card?.cardNumber,
                          cardName: previewListing.card?.cardName,
                        })}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Stock: {previewListing.quantity} · Precio: {fmtCLP(previewListing.finalPrice || 0)}
                    </div>
                  </div>
                </>
              ) : (
                <div className="inventory-preview-empty">Selecciona una carta para verla ampliada</div>
              )}
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}

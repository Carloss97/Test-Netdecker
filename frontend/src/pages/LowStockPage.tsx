import { useEffect, useState } from 'react';
import { getLowStockListings } from '../services/catalog';
import type { Listing } from '../types';
import { formatInventoryIdentifier } from '../utils/cardIdentifier';

export function LowStockPage() {
  const [thresholdInput, setThresholdInput] = useState('5');
  const [threshold, setThreshold] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [previewListingId, setPreviewListingId] = useState<string | null>(null);
  const [pinnedPreviewListingId, setPinnedPreviewListingId] = useState<string | null>(null);

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

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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
          <button type="button" className="btn btn-secondary" onClick={() => void loadLowStock(threshold)} disabled={loading}>
            Reintentar
          </button>
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

      {!loading && !error && listings.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">✅</div>
          <h3>Sin alertas con el umbral actual</h3>
          <p>No hay listings activos con stock menor o igual a {threshold}.</p>
        </div>
      )}

      {!loading && !error && listings.length > 0 && (
        <div className="card">
          <div className="section-title" style={{ marginBottom: 12 }}>
            {listings.length} listing(s) en alerta (umbral: {threshold})
          </div>
          <div className="listings-preview-pane">
            <div className="table-wrapper listings-preview-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Carta</th>
                    <th>Código</th>
                    <th>Rareza</th>
                    <th>Stock</th>
                    <th>Precio CLP</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((listing) => {
                    const isActivePreview = previewListing?.id === listing.id;
                    return (
                      <tr
                        key={listing.id}
                        className={isActivePreview ? 'row-preview-active' : ''}
                        onMouseEnter={() => setHoveredPreviewListing(listing.id)}
                      >
                        <td>
                          <span className="badge badge-gray">
                            {formatInventoryIdentifier({
                              editionCode: (listing.card as Listing['card'] & { edition?: { editionCode?: string } })?.edition?.editionCode,
                              cardCode: listing.card?.cardCode,
                              cardNumber: listing.card?.cardNumber,
                              cardName: listing.card?.cardName,
                            })}
                          </span>
                        </td>
                        <td>
                          <div
                            style={{ fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                            onClick={() => togglePinnedPreviewListing(listing.id)}
                            title={pinnedPreviewListingId === listing.id ? 'Desfijar vista previa' : 'Fijar vista previa'}
                          >
                            {listing.card?.cardName || 'Sin nombre'}
                            {listing.card?.imageUrl && <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>🖼</span>}
                          </div>
                        </td>
                        <td>
                          <span className="badge badge-gray">
                            {listing.card?.cardCode || '—'}
                          </span>
                        </td>
                        <td>
                          {listing.card?.rarity ? (
                            <span className="badge badge-gray">{listing.card.rarity}</span>
                          ) : '—'}
                        </td>
                        <td>
                          <span className={`badge ${listing.quantity <= 2 ? 'badge-red' : 'badge-yellow'}`}>
                            {listing.quantity}
                          </span>
                        </td>
                        <td>{fmtCLP(listing.finalPrice || 0)}</td>
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

            <aside className="inventory-preview-panel">
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

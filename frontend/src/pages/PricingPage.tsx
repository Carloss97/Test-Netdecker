import { useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import { getAvailableListings, syncListingPrices, getPriceVolatility } from '../services/catalog';
import type { Listing } from '../types';

interface VolatileEvent {
  priceHistoryId?: string;
  listingId?: string;
  cardName?: string;
  editionCode?: string;
  percentChange?: number;
  oldPrice?: number;
  newPrice?: number;
  createdAt?: string;
}

interface VolatileResponse {
  success: boolean;
  total: number;
  events: VolatileEvent[];
}

export function PricingPage() {
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const { data: listings, status: listingsStatus, error: listingsError, execute: reloadListings } = useAsync<Listing[]>(
    () => getAvailableListings()
  );

  const { data: volatileData, status: volatileStatus } = useAsync<VolatileResponse>(
    () => getPriceVolatility()
  );

  const activeListings = (listings ?? []).filter((l) => l.quantity > 0);

  const fmtCLP = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    setSyncError(null);
    try {
      const result = await syncListingPrices(undefined, undefined, 'Manual sync from PricingPage');
      setSyncMsg(`Sincronización completada: ${(result as { updated?: number }).updated ?? 0} actualizados`);
      reloadListings();
    } catch {
      setSyncError('Error al sincronizar precios');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          {syncMsg && (
            <span style={{ color: 'var(--success)', fontSize: '0.875rem' }}>✓ {syncMsg}</span>
          )}
          {syncError && (
            <span style={{ color: 'var(--danger)', fontSize: '0.875rem' }}>⚠ {syncError}</span>
          )}
        </div>
        <button className="btn btn-primary" onClick={handleSync} disabled={syncing}>
          {syncing ? '⏳ Sincronizando…' : '🔄 Sincronizar Precios'}
        </button>
      </div>

      {volatileStatus === 'success' && volatileData && volatileData.events?.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="section-title" style={{ marginBottom: 12 }}>⚠ Alertas de Precio (cambio &gt;10%)</div>
          {volatileData.events.slice(0, 5).map((v, i) => (
            <div key={i} className="alert-row">
              <span style={{ flex: 1, fontWeight: 500, fontSize: '0.875rem' }}>{v.cardName ?? 'Carta desconocida'}</span>
              <span style={{ color: (v.percentChange ?? 0) > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600, fontSize: '0.875rem' }}>
                {(v.percentChange ?? 0) > 0 ? '+' : ''}{v.percentChange?.toFixed(1)}%
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                ${v.oldPrice?.toFixed(2)} → ${v.newPrice?.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div className="section-title" style={{ margin: 0 }}>
            Listings con Stock ({activeListings.length})
          </div>
        </div>

        {listingsStatus === 'pending' ? (
          <div className="loading-spinner">⏳ Cargando precios…</div>
        ) : listingsStatus === 'error' ? (
          <div className="error-message">⚠ {listingsError?.message}</div>
        ) : activeListings.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💰</div>
            <h3>Sin listings activos</h3>
            <p>No hay cartas con stock disponible</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Carta</th>
                  <th>Rareza</th>
                  <th>Stock</th>
                  <th>Precio Ref (USD)</th>
                  <th>Precio Final (CLP)</th>
                  <th>Última Sync</th>
                </tr>
              </thead>
              <tbody>
                {activeListings.map((listing) => (
                  <tr key={listing.id}>
                    <td style={{ fontWeight: 500 }}>{listing.card?.cardName ?? '—'}</td>
                    <td>
                      {listing.card?.rarity ? (
                        <span className="badge badge-gray">{listing.card.rarity}</span>
                      ) : '—'}
                    </td>
                    <td>
                      <span className={`badge ${listing.quantity > 5 ? 'badge-green' : listing.quantity > 0 ? 'badge-yellow' : 'badge-red'}`}>
                        {listing.quantity}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {listing.referencePrice != null ? `$${listing.referencePrice.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {listing.finalPrice != null ? fmtCLP(listing.finalPrice) : '—'}
                    </td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {listing.lastSyncedAt
                        ? new Date(listing.lastSyncedAt).toLocaleDateString('es-CL')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

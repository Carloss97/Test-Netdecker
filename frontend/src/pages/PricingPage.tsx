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
  const [selectedTcg, setSelectedTcg] = useState<'ALL' | 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE'>('ALL');
  const [syncScope, setSyncScope] = useState<'all' | 'tcg' | 'edition'>('all');
  const [selectedEditionId, setSelectedEditionId] = useState('');

  const { data: listings, status: listingsStatus, error: listingsError, execute: reloadListings } = useAsync<Listing[]>(
    () => getAvailableListings()
  );

  const { data: volatileData, status: volatileStatus } = useAsync<VolatileResponse>(
    () => getPriceVolatility()
  );

  const activeListings = (listings ?? []).filter((l) => l.quantity > 0);
  const filteredListings = activeListings.filter((l) => {
    if (selectedTcg === 'ALL') return true;
    const tcgName = (l.card as Listing['card'] & { tcg?: { name?: string } })?.tcg?.name;
    return tcgName === selectedTcg;
  });
  const availableEditions = filteredListings
    .map((l) => ({
      id: l.editionId,
      name: (l.card as Listing['card'] & { edition?: { editionName?: string; editionCode?: string } })?.edition?.editionName || 'Edición',
      code: (l.card as Listing['card'] & { edition?: { editionName?: string; editionCode?: string } })?.edition?.editionCode || '',
    }))
    .filter((e, idx, arr) => arr.findIndex((x) => x.id === e.id) === idx)
    .sort((a, b) => `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`));

  const fmtCLP = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    setSyncError(null);
    try {
      const filters: { tcgName?: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE'; editionId?: string } = {};
      if (syncScope === 'tcg') {
        if (selectedTcg === 'ALL') {
          setSyncError('Selecciona un TCG para sincronizar por juego');
          setSyncing(false);
          return;
        }
        filters.tcgName = selectedTcg;
      }
      if (syncScope === 'edition') {
        if (!selectedEditionId) {
          setSyncError('Selecciona una edición para sincronizar por set');
          setSyncing(false);
          return;
        }
        filters.editionId = selectedEditionId;
      }

      const result = await syncListingPrices(undefined, undefined, 'Manual sync from PricingPage', true, filters);
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="input input-sm" value={syncScope} onChange={(e) => setSyncScope(e.target.value as 'all' | 'tcg' | 'edition')}>
            <option value="all">Sync total</option>
            <option value="tcg">Sync por TCG</option>
            <option value="edition">Sync por edición</option>
          </select>
          {syncScope === 'tcg' && (
            <select className="input input-sm" value={selectedTcg} onChange={(e) => setSelectedTcg(e.target.value as 'ALL' | 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE')}>
              <option value="ALL">Selecciona TCG</option>
              <option value="MAGIC">MAGIC</option>
              <option value="POKEMON">POKEMON</option>
              <option value="YUGIOH">YUGIOH</option>
              <option value="ONE_PIECE">ONE_PIECE</option>
            </select>
          )}
          {syncScope === 'edition' && (
            <select className="input input-sm" value={selectedEditionId} onChange={(e) => setSelectedEditionId(e.target.value)}>
              <option value="">Selecciona edición</option>
              {availableEditions.map((ed) => (
                <option key={ed.id} value={ed.id}>{ed.code} · {ed.name}</option>
              ))}
            </select>
          )}
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
            Listings con Stock ({filteredListings.length})
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['ALL', 'MAGIC', 'POKEMON', 'YUGIOH', 'ONE_PIECE'] as const).map((tcg) => (
              <button
                key={tcg}
                type="button"
                className={`btn btn-sm ${selectedTcg === tcg ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSelectedTcg(tcg)}
              >
                {tcg === 'ALL' ? 'Todos' : tcg}
              </button>
            ))}
          </div>
        </div>

        {listingsStatus === 'pending' ? (
          <div className="loading-spinner">⏳ Cargando precios…</div>
        ) : listingsStatus === 'error' ? (
          <div className="error-message">⚠ {listingsError?.message}</div>
        ) : filteredListings.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💰</div>
            <h3>Sin listings activos</h3>
            <p>No hay cartas con stock disponible para este TCG</p>
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
                {filteredListings.map((listing) => {
                  return (
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
                );})}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

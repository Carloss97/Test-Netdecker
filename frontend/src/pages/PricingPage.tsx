import { useEffect, useRef, useState } from 'react';
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
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [autoSyncMinutes, setAutoSyncMinutes] = useState(60);
  const [staleDays, setStaleDays] = useState(7);
  const syncingRef = useRef(false);

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

  const staleThresholdMs = staleDays * 24 * 60 * 60 * 1000;
  const isListingStale = (listing: Listing) => {
    if (!listing.lastSyncedAt) return true;
    const lastSyncMs = new Date(listing.lastSyncedAt).getTime();
    if (!Number.isFinite(lastSyncMs)) return true;
    return Date.now() - lastSyncMs > staleThresholdMs;
  };
  const staleListings = filteredListings.filter((listing) => {
    return isListingStale(listing);
  });

  const fmtCLP = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  const handleSync = async (silent: boolean = false) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    if (!silent) {
      setSyncMsg(null);
      setSyncError(null);
    }
    try {
      const filters: { tcgName?: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE'; editionId?: string } = {};
      if (syncScope === 'tcg') {
        if (selectedTcg === 'ALL') {
          if (!silent) setSyncError('Selecciona un TCG para sincronizar por juego');
          setSyncing(false);
          syncingRef.current = false;
          return;
        }
        filters.tcgName = selectedTcg;
      }
      if (syncScope === 'edition') {
        if (!selectedEditionId) {
          if (!silent) setSyncError('Selecciona una edición para sincronizar por set');
          setSyncing(false);
          syncingRef.current = false;
          return;
        }
        filters.editionId = selectedEditionId;
      }

      const result = await syncListingPrices(undefined, undefined, 'Manual sync from PricingPage', true, filters);
      if (!silent) {
        setSyncMsg(`Sincronización completada: ${(result as { updated?: number }).updated ?? 0} actualizados`);
      }
      reloadListings();
    } catch {
      if (!silent) {
        setSyncError('Error al sincronizar precios');
      }
    } finally {
      setSyncing(false);
      syncingRef.current = false;
    }
  };

  useEffect(() => {
    const savedEnabled = window.localStorage.getItem('pricing:autoSyncEnabled');
    const savedMinutes = window.localStorage.getItem('pricing:autoSyncMinutes');
    const savedStaleDays = window.localStorage.getItem('pricing:staleDays');

    if (savedEnabled === 'true') setAutoSyncEnabled(true);
    if (savedMinutes) {
      const parsed = Number(savedMinutes);
      if (Number.isFinite(parsed) && parsed >= 5) setAutoSyncMinutes(parsed);
    }
    if (savedStaleDays) {
      const parsed = Number(savedStaleDays);
      if (Number.isFinite(parsed) && parsed >= 1) setStaleDays(parsed);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('pricing:autoSyncEnabled', String(autoSyncEnabled));
    window.localStorage.setItem('pricing:autoSyncMinutes', String(autoSyncMinutes));
    window.localStorage.setItem('pricing:staleDays', String(staleDays));
  }, [autoSyncEnabled, autoSyncMinutes, staleDays]);

  useEffect(() => {
    if (!autoSyncEnabled) return;
    const intervalMs = Math.max(5, autoSyncMinutes) * 60 * 1000;
    const id = window.setInterval(() => {
      handleSync(true);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [autoSyncEnabled, autoSyncMinutes, syncScope, selectedTcg, selectedEditionId]);

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

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-title" style={{ marginBottom: 10 }}>⏱ Configuración de Sincronización</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.9rem' }}>
            <input
              type="checkbox"
              checked={autoSyncEnabled}
              onChange={(e) => setAutoSyncEnabled(e.target.checked)}
            />
            Activar sincronización automática
          </label>
          <select
            className="input input-sm"
            value={autoSyncMinutes}
            onChange={(e) => setAutoSyncMinutes(Number(e.target.value))}
            disabled={!autoSyncEnabled}
          >
            <option value={15}>Cada 15 min</option>
            <option value={30}>Cada 30 min</option>
            <option value={60}>Cada 60 min</option>
            <option value={180}>Cada 3 horas</option>
            <option value={360}>Cada 6 horas</option>
          </select>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Scope actual del auto-sync: {syncScope === 'all' ? 'Total' : syncScope === 'tcg' ? 'Por TCG' : 'Por edición'}
          </span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-title" style={{ marginBottom: 10 }}>📌 Estado de Actualización</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Considerar desactualizado después de
          </label>
          <select className="input input-sm" value={staleDays} onChange={(e) => setStaleDays(Number(e.target.value))}>
            <option value={1}>1 día</option>
            <option value={3}>3 días</option>
            <option value={7}>7 días</option>
            <option value={14}>14 días</option>
            <option value={30}>30 días</option>
          </select>
          <span className={`badge ${staleListings.length > 0 ? 'badge-yellow' : 'badge-green'}`}>
            {staleListings.length} listing(s) con precio desactualizado
          </span>
        </div>
      </div>

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
                    <td>
                      <div style={{ fontWeight: 500 }}>{listing.card?.cardName ?? '—'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        Código: {listing.card?.cardCode ?? '—'}
                        <span className={`badge ${isListingStale(listing) ? 'badge-yellow' : 'badge-green'}`}>
                          {isListingStale(listing) ? 'Desactualizado' : 'Actualizado'}
                        </span>
                      </div>
                    </td>
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

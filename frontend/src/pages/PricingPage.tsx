import { useEffect, useRef, useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import { getAvailableListings, syncListingPrices, getPriceVolatility, updateListingPricingMode } from '../services/catalog';
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
  const roundRobinOrder: Array<'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE'> = ['MAGIC', 'POKEMON', 'YUGIOH', 'ONE_PIECE'];
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [selectedTcg, setSelectedTcg] = useState<'ALL' | 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE'>('ALL');
  const [syncScope, setSyncScope] = useState<'all' | 'tcg' | 'edition'>('all');
  const [selectedEditionId, setSelectedEditionId] = useState('');
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [autoSyncMinutes, setAutoSyncMinutes] = useState(60);
  const [autoSyncStrategy, setAutoSyncStrategy] = useState<'scope' | 'round-robin-tcg'>('scope');
  const [staleDays, setStaleDays] = useState(7);
  const [pricingModeFilter, setPricingModeFilter] = useState<'all' | 'api' | 'manual'>('all');
  const [manualPriceDrafts, setManualPriceDrafts] = useState<Record<string, string>>({});
  const [updatingPricingId, setUpdatingPricingId] = useState<string | null>(null);
  const syncingRef = useRef(false);
  const roundRobinIndexRef = useRef(0);

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
  }).filter((l) => {
    if (pricingModeFilter === 'all') return true;
    if (pricingModeFilter === 'manual') return l.status === 'manual';
    return l.status !== 'manual';
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
  const nextRoundRobinTcg = roundRobinOrder[roundRobinIndexRef.current % roundRobinOrder.length];

  const fmtCLP = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  const updatePricingMode = async (listing: Listing, mode: 'manual' | 'api') => {
    setUpdatingPricingId(listing.id);
    setSyncError(null);
    setSyncMsg(null);

    try {
      if (mode === 'manual') {
        const rawDraft = manualPriceDrafts[listing.id] ?? String(Math.round(listing.finalPrice || 0));
        const manualPrice = Number(rawDraft);
        if (!Number.isFinite(manualPrice) || manualPrice <= 0) {
          setSyncError('Ingresa un precio manual CLP válido (> 0)');
          return;
        }
        await updateListingPricingMode(listing.id, 'manual', manualPrice);
        setSyncMsg('Precio manual guardado. Este listing queda fuera del sync automático/API.');
      } else {
        await updateListingPricingMode(listing.id, 'api');
        setSyncMsg('Modo API restaurado para el listing.');
      }

      reloadListings();
    } catch {
      setSyncError('No se pudo actualizar el modo de precio del listing');
    } finally {
      setUpdatingPricingId(null);
    }
  };

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
      if (autoSyncStrategy === 'round-robin-tcg' && silent) {
        const tcgName = roundRobinOrder[roundRobinIndexRef.current % roundRobinOrder.length];
        roundRobinIndexRef.current = (roundRobinIndexRef.current + 1) % roundRobinOrder.length;
        filters.tcgName = tcgName;
      }

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
    const savedStrategy = window.localStorage.getItem('pricing:autoSyncStrategy');
    const savedStaleDays = window.localStorage.getItem('pricing:staleDays');

    if (savedEnabled === 'true') setAutoSyncEnabled(true);
    if (savedMinutes) {
      const parsed = Number(savedMinutes);
      if (Number.isFinite(parsed) && parsed >= 5) setAutoSyncMinutes(parsed);
    }
    if (savedStrategy === 'scope' || savedStrategy === 'round-robin-tcg') {
      setAutoSyncStrategy(savedStrategy);
    }
    if (savedStaleDays) {
      const parsed = Number(savedStaleDays);
      if (Number.isFinite(parsed) && parsed >= 1) setStaleDays(parsed);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('pricing:autoSyncEnabled', String(autoSyncEnabled));
    window.localStorage.setItem('pricing:autoSyncMinutes', String(autoSyncMinutes));
    window.localStorage.setItem('pricing:autoSyncStrategy', autoSyncStrategy);
    window.localStorage.setItem('pricing:staleDays', String(staleDays));
  }, [autoSyncEnabled, autoSyncMinutes, autoSyncStrategy, staleDays]);

  useEffect(() => {
    if (!autoSyncEnabled) return;
    const intervalMs = Math.max(5, autoSyncMinutes) * 60 * 1000;
    const id = window.setInterval(() => {
      handleSync(true);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [autoSyncEnabled, autoSyncMinutes, autoSyncStrategy, syncScope, selectedTcg, selectedEditionId]);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="input input-sm" value={syncScope} onChange={(e) => setSyncScope(e.target.value as 'all' | 'tcg' | 'edition')} title="Define el alcance de la sincronización manual">
            <option value="all">Sincronización total</option>
            <option value="tcg">Sincronizar por TCG</option>
            <option value="edition">Sincronizar por edición</option>
          </select>
          {syncScope === 'tcg' && (
            <select className="input input-sm" value={selectedTcg} onChange={(e) => setSelectedTcg(e.target.value as 'ALL' | 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE')} title="TCG puntual a sincronizar cuando el alcance es por TCG">
              <option value="ALL">Selecciona un TCG</option>
              <option value="MAGIC">MAGIC</option>
              <option value="POKEMON">POKEMON</option>
              <option value="YUGIOH">YUGIOH</option>
              <option value="ONE_PIECE">ONE PIECE</option>
            </select>
          )}
          {syncScope === 'edition' && (
            <select className="input input-sm" value={selectedEditionId} onChange={(e) => setSelectedEditionId(e.target.value)} title="Edición específica a sincronizar">
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
          <button className="btn btn-primary" onClick={() => { void handleSync(); }} disabled={syncing} title="Ejecuta la sincronización manual con los filtros actuales">
            {syncing ? '⏳ Sincronizando…' : '🔄 Sincronizar Precios'}
          </button>
        </div>
        <div style={{ marginTop: 8, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Define el alcance de la sincronización manual: total, por TCG o por edición específica.
        </div>
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
            title="Frecuencia de ejecución de la sincronización automática"
          >
            <option value={15}>Cada 15 min</option>
            <option value={30}>Cada 30 min</option>
            <option value={60}>Cada 60 min</option>
            <option value={180}>Cada 3 horas</option>
            <option value={360}>Cada 6 horas</option>
          </select>
          <select
            className="input input-sm"
            value={autoSyncStrategy}
            onChange={(e) => setAutoSyncStrategy(e.target.value as 'scope' | 'round-robin-tcg')}
            disabled={!autoSyncEnabled}
            title="Estrategia: usar alcance actual o rotar por TCG"
          >
            <option value="scope">Usar alcance actual</option>
            <option value="round-robin-tcg">Rotar por TCG (1 por intervalo)</option>
          </select>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {autoSyncStrategy === 'round-robin-tcg'
              ? 'Modo rotativo: cada intervalo sincroniza solo 1 TCG'
              : `Alcance actual del auto-sync: ${syncScope === 'all' ? 'Total' : syncScope === 'tcg' ? 'Por TCG' : 'Por edición'}`}
          </span>
        </div>
        <div style={{ marginTop: 8, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          {autoSyncStrategy === 'round-robin-tcg'
            ? `Próximo TCG en ronda: ${nextRoundRobinTcg}`
            : 'Consejo: usa modo rotativo por TCG para reducir carga de APIs en catálogos grandes.'}
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
            {staleListings.length} registros con precio desactualizado
          </span>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div className="section-title" style={{ margin: 0 }}>
            Listings con stock ({filteredListings.length})
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              className="input input-sm"
              value={pricingModeFilter}
              onChange={(e) => setPricingModeFilter(e.target.value as 'all' | 'api' | 'manual')}
              title="Filtrar por modo de precio"
            >
              <option value="all">Todos los modos</option>
              <option value="api">Solo API</option>
              <option value="manual">Solo manual</option>
            </select>
            {(['ALL', 'MAGIC', 'POKEMON', 'YUGIOH', 'ONE_PIECE'] as const).map((tcg) => (
              <button
                key={tcg}
                type="button"
                className={`btn btn-sm ${selectedTcg === tcg ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSelectedTcg(tcg)}
                title={`Filtrar tabla por ${tcg === 'ALL' ? 'todos los TCG' : tcg}`}
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
                  <th>Modo Precio</th>
                  <th>Precio Ref (USD)</th>
                  <th>Precio Final (CLP)</th>
                  <th>Acción</th>
                  <th>Última sincronización</th>
                </tr>
              </thead>
              <tbody>
                {filteredListings.map((listing) => {
                  const isManual = listing.status === 'manual';
                  const draft = manualPriceDrafts[listing.id] ?? String(Math.round(listing.finalPrice || 0));
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
                    <td>
                      <span className={`badge ${isManual ? 'badge-yellow' : 'badge-blue'}`}>
                        {isManual ? 'Manual' : 'API'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {listing.referencePrice != null ? `$${listing.referencePrice.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {listing.finalPrice != null ? fmtCLP(listing.finalPrice) : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="number"
                          className="input input-sm"
                          value={draft}
                          onChange={(e) => setManualPriceDrafts((prev) => ({ ...prev, [listing.id]: e.target.value }))}
                          style={{ width: 120 }}
                          disabled={updatingPricingId === listing.id}
                          title="Precio manual CLP para este listing"
                        />
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={updatingPricingId === listing.id}
                          onClick={() => updatePricingMode(listing, 'manual')}
                          title="Fijar precio manual y excluir del sync API"
                        >
                          {updatingPricingId === listing.id && isManual ? '⏳ Guardando…' : 'Fijar manual'}
                        </button>
                        {isManual && (
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={updatingPricingId === listing.id}
                            onClick={() => updatePricingMode(listing, 'api')}
                            title="Volver a precio calculado por API"
                          >
                            Usar API
                          </button>
                        )}
                      </div>
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

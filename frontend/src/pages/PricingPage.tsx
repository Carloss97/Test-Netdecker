import { useEffect, useRef, useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import { getAvailableListings, syncListingPrices, getPriceVolatility, updateListingPricingMode } from '../services/catalog';
import type { Listing } from '../types';
import { parsePositiveNumberInput } from '../constants/pricing';
import { formatInventoryIdentifier } from '../utils/cardIdentifier';

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

export function PricingPage() {
  const roundRobinOrder: Array<'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ'> = ['MAGIC', 'POKEMON', 'YUGIOH', 'ONE_PIECE', 'DIGIMON', 'WEISS_SCHWARZ'];
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [selectedTcg, setSelectedTcg] = useState<'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ'>('MAGIC');
  const [syncScope, setSyncScope] = useState<'all' | 'tcg' | 'edition'>('all');
  const [selectedEditionId, setSelectedEditionId] = useState('');
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [autoSyncMinutes, setAutoSyncMinutes] = useState(60);
  const [autoSyncStrategy, setAutoSyncStrategy] = useState<'scope' | 'round-robin-tcg'>('scope');
  const [staleDays, setStaleDays] = useState(7);
  const [volatilityWindow, setVolatilityWindow] = useState<'24h' | '7d' | '30d' | '90d'>('7d');
  const [listingSearch, setListingSearch] = useState('');
  const [sortColumn, setSortColumn] = useState<'name' | 'code' | 'rarity' | 'stock' | 'mode' | 'reference' | 'final' | 'lastSync'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [manualPriceDrafts, setManualPriceDrafts] = useState<Record<string, string>>({});
  const [updatingPricingId, setUpdatingPricingId] = useState<string | null>(null);
  const [previewListingId, setPreviewListingId] = useState<string | null>(null);
  const [pinnedPreviewListingId, setPinnedPreviewListingId] = useState<string | null>(null);
  const [volatileData, setVolatileData] = useState<VolatileResponse | null>(null);
  const [volatileStatus, setVolatileStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const syncingRef = useRef(false);
  const roundRobinIndexRef = useRef(0);

  const { data: listings, status: listingsStatus, error: listingsError, execute: reloadListings } = useAsync<Listing[]>(
    () => getAvailableListings()
  );

  useEffect(() => {
    setVolatileStatus('pending');
    getPriceVolatility(20, volatilityWindow)
      .then((data) => {
        setVolatileData(data as VolatileResponse);
        setVolatileStatus('success');
      })
      .catch(() => {
        setVolatileData(null);
        setVolatileStatus('error');
      });
  }, [volatilityWindow]);

  const activeListings = (listings ?? []).filter((l) => l.quantity > 0);
  const tcgListings = activeListings.filter((l) => {
    const tcgName = (l.card as Listing['card'] & { tcg?: { name?: string } })?.tcg?.name;
    return tcgName === selectedTcg;
  });
  const filteredListings = tcgListings.filter((l) => {
    const q = listingSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      (l.card?.cardName ?? '').toLowerCase().includes(q)
      || (l.card?.cardCode ?? '').toLowerCase().includes(q)
    );
  });
  const sortedListings = [...filteredListings].sort((a, b) => {
    const mult = sortDirection === 'asc' ? 1 : -1;
    const aLastSync = a.lastSyncedAt ? new Date(a.lastSyncedAt).getTime() : 0;
    const bLastSync = b.lastSyncedAt ? new Date(b.lastSyncedAt).getTime() : 0;
    const aMode = a.status === 'manual' ? 'manual' : 'api';
    const bMode = b.status === 'manual' ? 'manual' : 'api';

    switch (sortColumn) {
      case 'name':
        return mult * (a.card?.cardName ?? '').localeCompare(b.card?.cardName ?? '');
      case 'code':
        return mult * (a.card?.cardCode ?? '').localeCompare(b.card?.cardCode ?? '');
      case 'rarity':
        return mult * (a.card?.rarity ?? '').localeCompare(b.card?.rarity ?? '');
      case 'stock':
        return mult * (a.quantity - b.quantity);
      case 'mode':
        return mult * aMode.localeCompare(bMode);
      case 'reference':
        return mult * ((a.referencePrice ?? 0) - (b.referencePrice ?? 0));
      case 'final':
        return mult * ((a.finalPrice ?? 0) - (b.finalPrice ?? 0));
      case 'lastSync':
        return mult * (aLastSync - bLastSync);
      default:
        return 0;
    }
  });
  const previewListing = sortedListings.find((listing) => listing.id === previewListingId) ?? sortedListings[0] ?? null;
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
  const availableEditions = tcgListings
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
  const staleListings = sortedListings.filter((listing) => {
    return isListingStale(listing);
  });
  const nextRoundRobinTcg = roundRobinOrder[roundRobinIndexRef.current % roundRobinOrder.length];

  const fmtCLP = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  const setPricingMode = async (listing: Listing, mode: 'manual' | 'api') => {
    setUpdatingPricingId(listing.id);
    setSyncError(null);
    setSyncMsg(null);

    try {
      if (mode === 'manual') {
        const rawDraft = manualPriceDrafts[listing.id] ?? String(Math.round(listing.finalPrice || 0));
        const manualPrice = parsePositiveNumberInput(rawDraft);
        if (!manualPrice) {
          setSyncError('Ingresa un precio final en CLP valido (> 0). El precio de referencia USD se sincroniza por separado.');
          return false;
        }
        await updateListingPricingMode(listing.id, 'manual', manualPrice);
        setSyncMsg('Modo manual activado y precio guardado.');
      } else {
        await updateListingPricingMode(listing.id, 'api');
        setSyncMsg('Modo API restaurado para el listing.');
      }

      reloadListings();
      return true;
    } catch {
      setSyncError('No se pudo actualizar el modo de precio del listing');
      return false;
    } finally {
      setUpdatingPricingId(null);
    }
  };

  const saveManualPrice = async (listing: Listing) => {
    if (listing.status !== 'manual' || updatingPricingId === listing.id) return;
    return setPricingMode(listing, 'manual');
  };

  useEffect(() => {
    setSelectedEditionId('');
  }, [selectedTcg]);

  const toggleSort = (column: 'name' | 'code' | 'rarity' | 'stock' | 'mode' | 'reference' | 'final' | 'lastSync') => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortColumn(column);
    setSortDirection('asc');
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
      const filters: { tcgName?: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ'; editionId?: string } = {};
      if (autoSyncStrategy === 'round-robin-tcg' && silent) {
        const tcgName = roundRobinOrder[roundRobinIndexRef.current % roundRobinOrder.length];
        roundRobinIndexRef.current = (roundRobinIndexRef.current + 1) % roundRobinOrder.length;
        filters.tcgName = tcgName;
      }

      if (syncScope === 'tcg') {
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

  useEffect(() => {
    if (!sortedListings.length) {
      setPreviewListingId(null);
      setPinnedPreviewListingId(null);
      return;
    }

    setPreviewListingId((currentId) => {
      if (currentId && sortedListings.some((listing) => listing.id === currentId)) {
        return currentId;
      }
      return sortedListings[0].id;
    });

    setPinnedPreviewListingId((currentId) => {
      if (!currentId) return null;
      return sortedListings.some((listing) => listing.id === currentId) ? currentId : null;
    });
  }, [sortedListings]);

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
            <select className="input input-sm" value={selectedTcg} onChange={(e) => setSelectedTcg(e.target.value as 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ')} title="TCG puntual a sincronizar cuando el alcance es por TCG">
              <option value="MAGIC">MAGIC</option>
              <option value="POKEMON">POKEMON</option>
              <option value="YUGIOH">YUGIOH</option>
              <option value="ONE_PIECE">ONE PIECE</option>
              <option value="DIGIMON">DIGIMON</option>
              <option value="WEISS_SCHWARZ">WEISS SCHWARZ</option>
            </select>
          )}
          {syncScope === 'edition' && (
            <>
              <select className="input input-sm" value={selectedTcg} onChange={(e) => setSelectedTcg(e.target.value as any)} title="TCG para filtrar ediciones">
                <option value="MAGIC">MAGIC</option>
                <option value="POKEMON">POKEMON</option>
                <option value="YUGIOH">YUGIOH</option>
                <option value="ONE_PIECE">ONE PIECE</option>
                <option value="DIGIMON">DIGIMON</option>
                <option value="WEISS_SCHWARZ">WEISS SCHWARZ</option>
              </select>
              <select className="input input-sm" value={selectedEditionId} onChange={(e) => setSelectedEditionId(e.target.value)} title="Edición específica a sincronizar">
                <option value="">Selecciona edición</option>
                {availableEditions.map((ed) => (
                    <option key={ed.id} value={ed.id}>{ed.code} · {ed.name}</option>
                  ))}
              </select>
            </>
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

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-title" style={{ marginBottom: 10 }}>⚠ Cambios de Precio Volátiles</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Ventana de análisis</label>
          <select className="input input-sm" value={volatilityWindow} onChange={(e) => setVolatilityWindow(e.target.value as '24h' | '7d' | '30d' | '90d')}>
            <option value="24h">Últimas 24 horas</option>
            <option value="7d">Últimos 7 días</option>
            <option value="30d">Últimos 30 días</option>
            <option value="90d">Últimos 90 días</option>
          </select>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Solo considera cambios detectados por API y excluye precios que pasaron de 0 por primera carga.
          </span>
        </div>
        {volatileStatus === 'pending' && (
          <div className="loading-spinner">⏳ Cargando cambios volátiles…</div>
        )}
        {volatileStatus === 'success' && volatileData && volatileData.events?.length > 0 && (
          <div>
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
        {volatileStatus === 'success' && (!volatileData || !volatileData.events || volatileData.events.length === 0) && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Sin cambios volátiles en la ventana seleccionada.</div>
        )}
      </div>

      <div className="card">
        <div className="pricing-listings-toolbar">
          <div className="section-title" style={{ margin: 0 }}>
            Listings con stock ({sortedListings.length})
          </div>
          <div className="pricing-listings-controls">
            <input
              className="input input-sm"
              style={{ minWidth: 220 }}
              value={listingSearch}
              onChange={(e) => setListingSearch(e.target.value)}
              placeholder="Buscar por nombre o código"
              title="Filtrar listings por nombre o código de carta"
            />
            {(['MAGIC', 'POKEMON', 'YUGIOH', 'ONE_PIECE', 'DIGIMON', 'WEISS_SCHWARZ'] as const).map((tcg) => (
              <button
                key={tcg}
                type="button"
                className={`btn btn-sm ${selectedTcg === tcg ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSelectedTcg(tcg)}
                title={`Filtrar tabla por ${tcg}`}
              >
                {tcg}
              </button>
            ))}
          </div>
        </div>

        {listingsStatus === 'pending' ? (
          <div className="loading-spinner">⏳ Cargando precios…</div>
        ) : listingsStatus === 'error' ? (
          <div className="error-message">⚠ {listingsError?.message}</div>
        ) : sortedListings.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💰</div>
            <h3>Sin listings activos</h3>
            <p>No hay cartas con stock disponible para este TCG</p>
          </div>
        ) : (
          <div className="listings-preview-pane">
            <div className="table-wrapper listings-preview-table">
              <table className="data-table" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '14%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '12%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>#</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('name')}>Carta {sortColumn === 'name' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('code')}>Código {sortColumn === 'code' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('rarity')}>Rareza {sortColumn === 'rarity' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('stock')}>Stock {sortColumn === 'stock' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('reference')}>Precio Ref (USD) {sortColumn === 'reference' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('final')}>Precio Final (CLP) {sortColumn === 'final' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('mode')}>Modo {sortColumn === 'mode' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('lastSync')}>Última sync {sortColumn === 'lastSync' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}</th>
                </tr>
              </thead>
              <tbody>
                {sortedListings.map((listing) => {
                  const isManual = listing.status === 'manual';
                  const draft = manualPriceDrafts[listing.id] ?? String(Math.round(listing.finalPrice || 0));
                  const isActivePreview = previewListing?.id === listing.id;
                  return (
                  <tr
                    key={listing.id}
                    className={isActivePreview ? 'row-preview-active' : ''}
                    onMouseEnter={() => setHoveredPreviewListing(listing.id)}
                  >
                    <td>
                      <span style={{ fontWeight: 600 }}>{formatInventoryIdentifier({
                        editionCode: (listing.card as Listing['card'] & { edition?: { editionCode?: string } })?.edition?.editionCode,
                        cardCode: listing.card?.cardCode,
                        cardNumber: listing.card?.cardNumber,
                        cardName: listing.card?.cardName,
                      })}</span>
                    </td>
                    <td>
                      <div
                        style={{ fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                        onClick={() => togglePinnedPreviewListing(listing.id)}
                        title={pinnedPreviewListingId === listing.id ? 'Desfijar vista previa' : 'Fijar vista previa'}
                      >
                        {listing.card?.cardName ?? '—'}
                        {listing.card?.imageUrl && <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>🖼</span>}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className={`badge ${isListingStale(listing) ? 'badge-yellow' : 'badge-green'}`}>
                          {isListingStale(listing) ? 'Desactualizado' : 'Actualizado'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{listing.card?.cardCode ?? '—'}</span>
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
                    <td style={{ fontWeight: 600, overflow: 'hidden' }}>
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
                            onBlur={() => { void saveManualPrice(listing); }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void saveManualPrice(listing);
                              }
                            }}
                          />
                        </div>
                      ) : (
                        listing.finalPrice != null ? fmtCLP(listing.finalPrice) : '—'
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                        <ModeToggle
                          checked={isManual}
                          disabled={updatingPricingId === listing.id}
                          onToggle={() => {
                            if (!isManual) {
                              setManualPriceDrafts((prev) => ({
                                ...prev,
                                [listing.id]: prev[listing.id] ?? String(Math.round(listing.finalPrice || 0)),
                              }));
                              void setPricingMode(listing, 'manual');
                            } else {
                              void setPricingMode(listing, 'api');
                            }
                          }}
                          onLabel="modo manual"
                          offLabel="modo api"
                        />
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
                      Stock: {previewListing.quantity} · Precio: {previewListing.finalPrice != null ? fmtCLP(previewListing.finalPrice) : '—'}
                    </div>
                  </div>
                </>
              ) : (
                <div className="inventory-preview-empty">Selecciona una carta para verla ampliada</div>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

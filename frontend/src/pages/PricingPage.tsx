import { useEffect, useRef, useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import { listListings, syncListingPrices, getPriceVolatility, getEditions } from '../services/catalog';
import type { Listing, EditionWithCounts } from '../types';

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
  const roundRobinOrder: Array<'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ'> = ['MAGIC', 'POKEMON', 'YUGIOH', 'ONE_PIECE', 'DIGIMON', 'WEISS_SCHWARZ'];
  type PricingTcgFilter = 'ALL' | 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ';
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [selectedTcg, setSelectedTcg] = useState<PricingTcgFilter>('ALL');
  const [syncScope, setSyncScope] = useState<'all' | 'tcg' | 'edition'>('all');
  const [selectedEditionId, setSelectedEditionId] = useState('');
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [autoSyncMinutes, setAutoSyncMinutes] = useState(60);
  const [autoSyncStrategy, setAutoSyncStrategy] = useState<'scope' | 'round-robin-tcg'>('scope');
  const [staleDays, setStaleDays] = useState(7);
  const [volatilityWindow, setVolatilityWindow] = useState<'24h' | '7d' | '30d' | '90d'>('7d');
  const listingSearch = '';
  const [volatileData, setVolatileData] = useState<VolatileResponse | null>(null);
  const [volatileStatus, setVolatileStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [editions, setEditions] = useState<EditionWithCounts[]>([]);
  const syncingRef = useRef(false);
  const roundRobinIndexRef = useRef(0);

  const { data: listings, execute: reloadListings } = useAsync<Listing[]>(
    () => listListings({ take: 200 }) // Load more for management
  );

  useEffect(() => {
    getEditions({ tcgId: selectedTcg === 'ALL' ? undefined : selectedTcg, activeOnly: true })
      .then(setEditions)
      .catch(() => setEditions([]));
  }, [selectedTcg]);

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
    if (selectedTcg === 'ALL') return true;
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
    return (a.card?.cardName ?? '').localeCompare(b.card?.cardName ?? '');
  });
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

  useEffect(() => {
    setSelectedEditionId('');
  }, [selectedTcg]);

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
        if (selectedTcg === 'ALL') {
          if (!silent) setSyncError('Selecciona un TCG específico para sincronizar por TCG.');
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
              <select className="input input-sm" value={selectedTcg} onChange={(e) => setSelectedTcg(e.target.value as 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ')} title="TCG para filtrar ediciones">
                <option value="MAGIC">MAGIC</option>
                <option value="POKEMON">POKEMON</option>
                <option value="YUGIOH">YUGIOH</option>
                <option value="ONE_PIECE">ONE PIECE</option>
                <option value="DIGIMON">DIGIMON</option>
                <option value="WEISS_SCHWARZ">WEISS SCHWARZ</option>
              </select>
              <select className="input input-sm" value={selectedEditionId} onChange={(e) => setSelectedEditionId(e.target.value)} title="Edición específica a sincronizar">
                <option value="">Selecciona edición</option>
                {editions.map((ed) => (
                    <option key={ed.id} value={ed.id}>{ed.editionCode} · {ed.editionName}</option>
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
                  {(v.percentChange ?? 0) > 0 ? '+' : ''}{Number(v.percentChange ?? 0).toFixed(1)}%
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  ${Number(v.oldPrice ?? 0).toFixed(2)} → ${Number(v.newPrice ?? 0).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
        {volatileStatus === 'success' && (!volatileData || !volatileData.events || volatileData.events.length === 0) && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Sin cambios volátiles en la ventana seleccionada.</div>
        )}
      </div>
    </div>
  );
}

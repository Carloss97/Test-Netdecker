import { useEffect, useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import {
  bootstrapCatalog,
  getAdminDashboard,
  getAdminPricingConfig,
  getPriceVolatility,
  getStockAlerts,
  getTcgplayerCoverage,
  syncCatalog,
  resetCatalog,
  updateAdminPricingConfig,
} from '../services/catalog';
import type { AdminDashboard, CatalogBootstrapResponse, CatalogSyncResponse, TcgplayerCoverage } from '../types';

function KpiCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e0e0e0',
        borderLeft: `4px solid ${color ?? '#1976d2'}`,
        borderRadius: 8,
        padding: '16px 20px',
        minWidth: 160,
        flex: '1 1 160px',
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h3 style={{ borderBottom: '1px solid #e0e0e0', paddingBottom: 8, marginBottom: 16 }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

export function AdminDashboardPage() {
  const dashboardQuery = useAsync(() => getAdminDashboard());
  const alertsQuery = useAsync(() => getStockAlerts(5));
  const coverageQuery = useAsync(() => getTcgplayerCoverage());
  const pricingConfigQuery = useAsync(() => getAdminPricingConfig());
  const [volatilityWindow, setVolatilityWindow] = useState<'24h' | '7d' | '30d' | '90d'>('7d');
  const [volatileLoading, setVolatileLoading] = useState(false);
  const [volatileEvents, setVolatileEvents] = useState<Array<{ priceHistoryId: string; cardName: string; editionCode: string; oldPrice: number; newPrice: number; percentChange: number; createdAt: string }>>([]);
  const [catalogTcg, setCatalogTcg] = useState<'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ' | ''>('');
  const [setCode, setSetCode] = useState('');
  const [setLimit, setSetLimit] = useState('');
  const [initialQuantity, setInitialQuantity] = useState('0');
  const [marginMultiplier, setMarginMultiplier] = useState('1.2');
  const [concurrency, setConcurrency] = useState('4');
  const [dryRun, setDryRun] = useState(false);
  const [createListings, setCreateListings] = useState(true);
  const [catalogActionLoading, setCatalogActionLoading] = useState<'bootstrap' | 'sync' | null>(null);
  const [catalogActionResult, setCatalogActionResult] = useState<{
    kind: 'bootstrap' | 'sync';
    payload: CatalogBootstrapResponse | CatalogSyncResponse;
  } | null>(null);
  const [catalogActionError, setCatalogActionError] = useState<string | null>(null);
  const [configMargin, setConfigMargin] = useState('1.2');
  const [applyMarginToExisting, setApplyMarginToExisting] = useState(true);
  const [exchangeRateMode, setExchangeRateMode] = useState<'api' | 'manual'>('api');
  const [manualUsdToClp, setManualUsdToClp] = useState('950');
  const [savingPricingConfig, setSavingPricingConfig] = useState(false);
  const [pricingConfigMsg, setPricingConfigMsg] = useState<string | null>(null);
  const [pricingConfigErr, setPricingConfigErr] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const dashboard = dashboardQuery.data as { success: boolean } & AdminDashboard | null;
  const coverage = coverageQuery.data as { success: boolean } & TcgplayerCoverage | null;
  const pricingConfigData = pricingConfigQuery.data as {
    success: boolean;
    config?: {
      defaultMarginMultiplier: number;
      exchangeRate: { mode: 'api' | 'manual'; activeRate: number };
    };
  } | null;
  const alerts = (alertsQuery.data as { alerts?: Array<{ listingId: string; cardName: string; editionCode: string; condition: string; quantity: number; finalPrice: number }> } | null)?.alerts ?? [];

  useEffect(() => {
    setVolatileLoading(true);
    getPriceVolatility(20, volatilityWindow)
      .then((data) => {
        const events = (data as { events?: Array<{ priceHistoryId: string; cardName: string; editionCode: string; oldPrice: number; newPrice: number; percentChange: number; createdAt: string }> }).events ?? [];
        setVolatileEvents(events);
      })
      .catch(() => {
        setVolatileEvents([]);
      })
      .finally(() => setVolatileLoading(false));
  }, [volatilityWindow]);

  const handleRefresh = () => window.location.reload();

  const handleSavePricingConfig = async () => {
    setSavingPricingConfig(true);
    setPricingConfigErr(null);
    setPricingConfigMsg(null);
    try {
      const margin = Number.parseFloat(configMargin);
      const manualRate = Number.parseFloat(manualUsdToClp);

      const result = await updateAdminPricingConfig({
        defaultMarginMultiplier: Number.isFinite(margin) && margin > 0 ? margin : undefined,
        applyMarginToExisting,
        exchangeRateMode,
        manualUsdToClp: exchangeRateMode === 'manual' ? manualRate : undefined,
      });

      setPricingConfigMsg(`Configuración guardada. Margen actualizado en ${(result as { updatedMargins?: number }).updatedMargins ?? 0} listing(s).`);
      pricingConfigQuery.execute();
      dashboardQuery.execute();
    } catch (err: unknown) {
      setPricingConfigErr(err instanceof Error ? err.message : 'No se pudo guardar configuración');
    } finally {
      setSavingPricingConfig(false);
    }
  };

  useEffect(() => {
    if (pricingConfigData?.config) {
      setConfigMargin(String(pricingConfigData.config.defaultMarginMultiplier));
      setExchangeRateMode(pricingConfigData.config.exchangeRate.mode);
      setManualUsdToClp(String(pricingConfigData.config.exchangeRate.activeRate));
    }
  }, [pricingConfigData]);

  const handleBootstrapCatalog = async () => {
    setCatalogActionLoading('bootstrap');
    setCatalogActionError(null);
    try {
      const tcg = catalogTcg && ['MAGIC', 'POKEMON', 'YUGIOH', 'ONE_PIECE', 'DIGIMON', 'WEISS_SCHWARZ'].includes(catalogTcg)
        ? (catalogTcg as 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ')
        : undefined;
      const payload = await bootstrapCatalog({
        tcg,
        setCode: setCode.trim() || undefined,
        setLimit: setLimit ? Number.parseInt(setLimit, 10) : undefined,
        dryRun,
        createListings,
        initialQuantity: Number.parseInt(initialQuantity || '0', 10),
        marginMultiplier: Number.parseFloat(marginMultiplier || '1.2'),
      });
      setCatalogActionResult({ kind: 'bootstrap', payload });
    } catch (err: unknown) {
      setCatalogActionError(err instanceof Error ? err.message : 'Error en carga inicial de catálogo');
    } finally {
      setCatalogActionLoading(null);
    }
  };

  const handleSyncCatalog = async () => {
    setCatalogActionLoading('sync');
    setCatalogActionError(null);
    try {
      const tcg = catalogTcg && ['MAGIC', 'POKEMON', 'YUGIOH', 'ONE_PIECE', 'DIGIMON', 'WEISS_SCHWARZ'].includes(catalogTcg)
        ? (catalogTcg as 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ')
        : undefined;
      const payload = await syncCatalog({
        tcg,
        dryRun,
        createListings,
        initialQuantity: Number.parseInt(initialQuantity || '0', 10),
        marginMultiplier: Number.parseFloat(marginMultiplier || '1.2'),
        concurrency: Number.parseInt(concurrency || '4', 10),
      });
      setCatalogActionResult({ kind: 'sync', payload });
    } catch (err: unknown) {
      setCatalogActionError(err instanceof Error ? err.message : 'Error al sincronizar catálogo');
    } finally {
      setCatalogActionLoading(null);
    }
  };

  const handleResetDatabase = async () => {
    setResetLoading(true);
    setResetError(null);
    setResetMessage(null);
    try {
      const result = await resetCatalog();
      setResetMessage(result.message || 'Base de datos reseteada exitosamente');
      setShowResetConfirm(false);
      // Refresh dashboard after reset
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : 'Error al resetear base de datos');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>⚙️ Panel de Administración</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button onClick={handleRefresh} style={{ padding: '6px 14px', cursor: 'pointer', borderRadius: 4, border: '1px solid #ddd', background: '#fff' }}>
            🔄 Recargar
          </button>
          <button onClick={() => setShowResetConfirm(true)} style={{ padding: '6px 14px', cursor: 'pointer', borderRadius: 4, border: '1px solid #d32f2f', background: '#ffebee', color: '#d32f2f', fontWeight: 500 }}>
            🗑️ Resetear BD
          </button>
        </div>
      </div>

      {dashboardQuery.status === 'pending' && <p>Cargando panel…</p>}
      {dashboardQuery.status === 'error' && (
        <p style={{ color: 'red' }}>
          No se pudo cargar el panel. Verifica que el backend esté corriendo.
        </p>
      )}

      {/* Reset Database Modal */}
      {showResetConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: '#fff',
            borderRadius: 8,
            padding: 24,
            maxWidth: 400,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}>
            <h3 style={{ margin: '0 0 12px 0', color: '#d32f2f' }}>⚠️ Confirmar Reset de Base de Datos</h3>
            <p style={{ margin: '0 0 16px 0', color: '#666', fontSize: 14 }}>
              Esta acción eliminará todos los sets, cartas, inventario y historico de precios. Los registros de TCG y tasas de cambio serán preservados.
            </p>
            <p style={{ margin: '0 0 16px 0', color: '#999', fontSize: 13, fontWeight: 'bold' }}>
              Esta acción es irreversible. ¿Estás seguro?
            </p>
            {resetError && (
              <p style={{ color: '#d32f2f', fontSize: 13, marginBottom: 12 }}>❌ {resetError}</p>
            )}
            {resetMessage && (
              <p style={{ color: '#388e3c', fontSize: 13, marginBottom: 12 }}>✅ {resetMessage}</p>
            )}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowResetConfirm(false)}
                disabled={resetLoading}
                style={{
                  padding: '8px 16px',
                  borderRadius: 4,
                  border: '1px solid #ddd',
                  background: '#fff',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleResetDatabase}
                disabled={resetLoading}
                style={{
                  padding: '8px 16px',
                  borderRadius: 4,
                  border: 'none',
                  background: '#d32f2f',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                {resetLoading ? '⏳ Reseteando...' : '🗑️ Reset'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Section title="🗂️ Consola de Catálogo">
        <div className="surface-card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4, fontWeight: 500 }}>TCG</label>
              <select value={catalogTcg} onChange={(e) => setCatalogTcg(e.target.value as any)} style={{ width: '100%', padding: '8px', borderRadius: 4, border: '1px solid #ddd' }}>
                <option value="">Todos los TCG</option>
                <option value="MAGIC">Magic</option>
                <option value="POKEMON">Pokémon</option>
                <option value="YUGIOH">Yu-Gi-Oh!</option>
                <option value="ONE_PIECE">One Piece</option>
                <option value="DIGIMON">Digimon Card Game</option>
                <option value="WEISS_SCHWARZ">Weiss Schwarz</option>
              </select>
              <div style={{ fontSize: 11, color: '#777', marginTop: 4 }}>
                Limita la operación a un juego. Si dejas "Todos", afecta todo el catálogo.
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4, fontWeight: 500 }}>Código de set</label>
              <input placeholder="Ej: MH3" value={setCode} onChange={(e) => setSetCode(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: 4, border: '1px solid #ddd' }} />
              <div style={{ fontSize: 11, color: '#777', marginTop: 4 }}>
                Ejecuta sobre un set puntual. Recomendado para pruebas controladas.
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4, fontWeight: 500 }}>Límite de sets</label>
              <input placeholder="Máximo" value={setLimit} onChange={(e) => setSetLimit(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: 4, border: '1px solid #ddd' }} type="number" />
              <div style={{ fontSize: 11, color: '#777', marginTop: 4 }}>
                Tope de sets por ejecución para no sobrecargar APIs.
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4, fontWeight: 500 }}>Stock inicial</label>
              <input placeholder="0" value={initialQuantity} onChange={(e) => setInitialQuantity(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: 4, border: '1px solid #ddd' }} type="number" />
              <div style={{ fontSize: 11, color: '#777', marginTop: 4 }}>
                Cantidad asignada a listings nuevos creados por esta operación.
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4, fontWeight: 500 }}>Margen</label>
              <input placeholder="1.2" value={marginMultiplier} onChange={(e) => setMarginMultiplier(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: 4, border: '1px solid #ddd' }} type="number" step="0.1" />
              <div style={{ fontSize: 11, color: '#777', marginTop: 4 }}>
                Multiplicador sobre precio USD de referencia. 1.20 = +20%.
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4, fontWeight: 500 }}>Concurrencia</label>
              <input placeholder="4" value={concurrency} onChange={(e) => setConcurrency(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: 4, border: '1px solid #ddd' }} type="number" />
              <div style={{ fontSize: 11, color: '#777', marginTop: 4 }}>
                Cantidad de tareas paralelas. Menor valor = menos riesgo de rate-limit.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
              <span style={{ fontSize: 13 }}>Simulación (sin guardar)</span>
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={createListings} onChange={(e) => setCreateListings(e.target.checked)} />
              <span style={{ fontSize: 13 }}>Crear listings</span>
            </label>
          </div>
          <div style={{ fontSize: 11, color: '#777', marginBottom: 12 }}>
            Para evitar romper inventario: primero ejecuta en Simulación con 1 TCG y un set pequeño.
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button type="button" onClick={handleBootstrapCatalog} disabled={catalogActionLoading !== null} style={{ padding: '10px 16px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 500 }}>
              {catalogActionLoading === 'bootstrap' ? '⏳ Cargando catálogo...' : '▶️ Carga inicial'}
            </button>
            <button type="button" onClick={handleSyncCatalog} disabled={catalogActionLoading !== null} style={{ padding: '10px 16px', background: '#388e3c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 500 }}>
              {catalogActionLoading === 'sync' ? '⏳ Sincronizando...' : '🔄 Sincronizar sets nuevos'}
            </button>
          </div>
          <p style={{ marginTop: 6, fontSize: 12, color: '#666' }}>
            Carga inicial crea catálogo base. Sincronizar sets nuevos solo trae sets recientes o cambios.
          </p>
          <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
            <strong>Sincronización/Carga inicial:</strong> Importa sets desde APIs externas de Magic, Pokémon, Yu-Gi-Oh! y One Piece.<br/>
            <strong>Precios:</strong> El precio de referencia se obtiene durante la importación y se actualiza con la sincronización de precios.
          </p>
        </div>

        {catalogActionError && <p style={{ color: '#b42318' }}>{catalogActionError}</p>}

        {catalogActionResult && (
          <div className="surface-card" style={{ padding: 16 }}>
            <strong>
              Resultado {catalogActionResult.kind === 'bootstrap' ? 'carga inicial' : 'sincronización'}
            </strong>
            <pre style={{ whiteSpace: 'pre-wrap', marginTop: 12, fontSize: 12 }}>
              {JSON.stringify(catalogActionResult.payload, null, 2)}
            </pre>
          </div>
        )}
      </Section>

      <Section title="💱 Parámetros de Precio">
        <div className="surface-card" style={{ padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4, fontWeight: 500 }}>Margen por defecto</label>
              <input
                type="number"
                step="0.05"
                value={configMargin}
                onChange={(e) => setConfigMargin(e.target.value)}
                title="Multiplicador aplicado al precio base. Ejemplo: 1.20 = +20%"
                style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ddd' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4, fontWeight: 500 }}>Modo de dólar</label>
              <select
                value={exchangeRateMode}
                onChange={(e) => setExchangeRateMode(e.target.value as 'api' | 'manual')}
                title="API automática usa proveedor externo. Manual usa el valor ingresado"
                style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ddd' }}
              >
                <option value="api">API automática</option>
                <option value="manual">Manual</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4, fontWeight: 500 }}>USD/CLP manual</label>
              <input
                type="number"
                value={manualUsdToClp}
                onChange={(e) => setManualUsdToClp(e.target.value)}
                disabled={exchangeRateMode !== 'manual'}
                title="Valor USD/CLP usado cuando el modo está en manual"
                style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ddd' }}
              />
            </div>
          </div>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, fontSize: 13 }}>
            <input type="checkbox" checked={applyMarginToExisting} onChange={(e) => setApplyMarginToExisting(e.target.checked)} />
            Aplicar margen a listings existentes
          </label>

          {pricingConfigData?.config && (
            <p style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>
              Estado actual: dólar en modo <strong>{pricingConfigData.config.exchangeRate.mode.toUpperCase()}</strong> · tasa activa <strong>{pricingConfigData.config.exchangeRate.activeRate.toLocaleString()} CLP</strong>
            </p>
          )}
          <p style={{ marginBottom: 12, color: '#666', fontSize: 12 }}>
            Recomendación: aplica margen global solo cuando quieras recalcular precios de todo el inventario.
          </p>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleSavePricingConfig}
              disabled={savingPricingConfig}
              title="Guarda margen y configuración de dólar para precios"
              style={{ padding: '10px 16px', background: '#5d4037', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 500 }}
            >
              {savingPricingConfig ? '⏳ Guardando...' : '💾 Guardar parámetros'}
            </button>
            {pricingConfigMsg && <span style={{ color: '#2e7d32', fontSize: 13 }}>{pricingConfigMsg}</span>}
            {pricingConfigErr && <span style={{ color: '#c62828', fontSize: 13 }}>{pricingConfigErr}</span>}
          </div>
        </div>
      </Section>

      {dashboard && (
        <>
          {/* KPI cards */}
          <Section title="Resumen del Catálogo">
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <KpiCard
                label="Cartas Totales"
                value={dashboard.kpis.catalog.totalCards.toLocaleString()}
                color="#1976d2"
              />
              <KpiCard
                label="Listings Activos"
                value={dashboard.kpis.catalog.activeListings.toLocaleString()}
                sub={`de ${dashboard.kpis.catalog.totalListings} total`}
                color="#388e3c"
              />
              <KpiCard
                label="Stock Bajo"
                value={dashboard.kpis.catalog.lowStockListings.toLocaleString()}
                sub="≤5 unidades"
                color="#f57c00"
              />
              <KpiCard
                label="Sin Stock"
                value={dashboard.kpis.catalog.outOfStockListings.toLocaleString()}
                color="#d32f2f"
              />
              <KpiCard
                label="Valor Inventario"
                value={`$${Math.round(dashboard.kpis.inventory.totalValueCLP / 1000).toLocaleString()}K`}
                sub="CLP (listings activos)"
                color="#7b1fa2"
              />
              <KpiCard
                label="Órdenes"
                value={dashboard.kpis.orders.total.toLocaleString()}
                sub={`${dashboard.kpis.orders.pending} pendientes`}
                color="#0288d1"
              />
            </div>
          </Section>

          {coverage && (
            <Section title="📊 Cobertura de Cartas y Fuentes de Precio">
              <p style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>
                <strong>Cartas totales:</strong> {coverage?.global.totalCards.toLocaleString()} importadas en todos los TCG.<br/>
                <strong>Fuentes:</strong> Magic (Scryfall), Pokémon (PokemonTCG API), Yu-Gi-Oh! (YGOPRODeck), One Piece (OPTCGAPI).
              </p>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
                <KpiCard
                  label="Cobertura Global"
                  value={`${coverage.global.coveragePercent.toFixed(2)}%`}
                  sub={`${coverage.global.coveredCards} / ${coverage.global.totalCards} cartas`}
                  color="#5d4037"
                />
                <KpiCard
                  label="IDs Faltantes"
                  value={coverage.global.uncoveredCards.toLocaleString()}
                  sub="Cartas pendientes de productId"
                  color="#8d6e63"
                />
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={thStyle}>TCG</th>
                    <th style={thStyle}>Cobertura</th>
                    <th style={thStyle}>Cubiertas</th>
                    <th style={thStyle}>Faltantes</th>
                    <th style={thStyle}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {coverage.byTcg.map((item) => (
                    <tr key={item.tcg} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={tdStyle}>{item.tcgDisplayName}</td>
                      <td style={tdStyle}>{item.coveragePercent.toFixed(2)}%</td>
                      <td style={tdStyle}>{item.coveredCards}</td>
                      <td style={tdStyle}>{item.uncoveredCards}</td>
                      <td style={tdStyle}>{item.totalCards}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* Exchange rate */}
          {dashboard.kpis.exchangeRate && (
            <Section title="Tipo de Cambio">
              <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: 16, display: 'inline-block' }}>
                <strong>1 USD = {dashboard.kpis.exchangeRate.usdToCLP.toLocaleString()} CLP</strong>
                <span style={{ marginLeft: 16, color: '#888', fontSize: 12 }}>
                  Fuente: {dashboard.kpis.exchangeRate.source}
                  {dashboard.kpis.exchangeRate.fetchedAt
                    ? ` · ${new Date(dashboard.kpis.exchangeRate.fetchedAt).toLocaleString()}`
                    : ''}
                </span>
              </div>
            </Section>
          )}

          {/* Recent imports */}
          {dashboard.recentImports.length > 0 && (
            <Section title="Importaciones Recientes">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={thStyle}>Archivo</th>
                    <th style={thStyle}>Estado</th>
                    <th style={thStyle}>Registros</th>
                    <th style={thStyle}>OK</th>
                    <th style={thStyle}>Errores</th>
                    <th style={thStyle}>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.recentImports.map((imp) => (
                    <tr key={imp.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={tdStyle}>{imp.fileName}</td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 12,
                            background:
                              imp.status === 'completed' ? '#e8f5e9' : imp.status === 'failed' ? '#ffebee' : '#fff3e0',
                            color:
                              imp.status === 'completed' ? '#2e7d32' : imp.status === 'failed' ? '#c62828' : '#e65100',
                            fontSize: 11,
                          }}
                        >
                          {imp.status}
                        </span>
                      </td>
                      <td style={tdStyle}>{imp.totalRecords}</td>
                      <td style={tdStyle}>{imp.successCount}</td>
                      <td style={tdStyle}>{imp.failureCount}</td>
                      <td style={tdStyle}>{new Date(imp.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* Recent price sync runs */}
          {dashboard.recentSyncRuns.length > 0 && (
            <Section title="Sincronizaciones de Precio Recientes">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={thStyle}>Fuente</th>
                    <th style={thStyle}>Estado</th>
                    <th style={thStyle}>Total</th>
                    <th style={thStyle}>Actualizados</th>
                    <th style={thStyle}>Volátiles</th>
                    <th style={thStyle}>Fallidos</th>
                    <th style={thStyle}>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.recentSyncRuns.map((run) => (
                    <tr key={run.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={tdStyle}>{run.source}</td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 12,
                            background:
                              run.status === 'completed' ? '#e8f5e9' : run.status === 'failed' ? '#ffebee' : '#fff3e0',
                            color:
                              run.status === 'completed' ? '#2e7d32' : run.status === 'failed' ? '#c62828' : '#e65100',
                            fontSize: 11,
                          }}
                        >
                          {run.status}
                        </span>
                      </td>
                      <td style={tdStyle}>{run.total}</td>
                      <td style={tdStyle}>{run.updated}</td>
                      <td style={tdStyle}>{run.volatile}</td>
                      <td style={tdStyle}>{run.failed}</td>
                      <td style={tdStyle}>{new Date(run.startedAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}
        </>
      )}

      {/* Stock alerts */}
      {alertsQuery.status !== 'error' && alerts.length > 0 && (
        <Section title={`Alertas de Stock Bajo (≤5 unidades)`}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#fff8e1' }}>
                <th style={thStyle}>Carta</th>
                <th style={thStyle}>Edición</th>
                <th style={thStyle}>Condición</th>
                <th style={thStyle}>Stock</th>
                <th style={thStyle}>Precio (CLP)</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.listingId} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={tdStyle}>{a.cardName}</td>
                  <td style={tdStyle}>{a.editionCode}</td>
                  <td style={tdStyle}>{a.condition}</td>
                  <td
                    style={{
                      ...tdStyle,
                      color: a.quantity === 0 ? '#d32f2f' : '#f57c00',
                      fontWeight: 600,
                    }}
                  >
                    {a.quantity}
                  </td>
                  <td style={tdStyle}>{Math.round(a.finalPrice).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Volatile price changes */}
      {(volatileLoading || volatileEvents.length > 0) && (
        <Section title="Cambios de Precio Volátiles Recientes">
          <div style={{ marginBottom: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: '#666' }}>Ventana</label>
            <select
              value={volatilityWindow}
              onChange={(e) => setVolatilityWindow(e.target.value as '24h' | '7d' | '30d' | '90d')}
              style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid #ddd' }}
            >
              <option value="24h">24 horas</option>
              <option value="7d">7 días</option>
              <option value="30d">30 días</option>
              <option value="90d">90 días</option>
            </select>
            <span style={{ fontSize: 12, color: '#666' }}>
              Solo cambios API con precio anterior mayor a 0.
            </span>
          </div>
          {volatileLoading ? (
            <div style={{ fontSize: 13, color: '#666' }}>⏳ Cargando cambios volátiles…</div>
          ) : volatileEvents.length === 0 ? (
            <div style={{ fontSize: 13, color: '#666' }}>Sin cambios volátiles para la ventana seleccionada.</div>
          ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#fce4ec' }}>
                <th style={thStyle}>Carta</th>
                <th style={thStyle}>Edición</th>
                <th style={thStyle}>Precio Anterior</th>
                <th style={thStyle}>Precio Nuevo</th>
                <th style={thStyle}>Cambio %</th>
                <th style={thStyle}>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {volatileEvents.map((e) => (
                <tr key={e.priceHistoryId} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={tdStyle}>{e.cardName}</td>
                  <td style={tdStyle}>{e.editionCode}</td>
                  <td style={tdStyle}>{Math.round(e.oldPrice).toLocaleString()}</td>
                  <td style={tdStyle}>{Math.round(e.newPrice).toLocaleString()}</td>
                  <td
                    style={{
                      ...tdStyle,
                      color: e.percentChange > 0 ? '#d32f2f' : '#388e3c',
                      fontWeight: 600,
                    }}
                  >
                    {e.percentChange > 0 ? '+' : ''}
                    {e.percentChange.toFixed(1)}%
                  </td>
                  <td style={tdStyle}>{new Date(e.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </Section>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: 12,
  borderBottom: '1px solid #e0e0e0',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
};

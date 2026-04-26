import { useEffect, useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import { Link } from 'react-router-dom';
import apiClient from '../services/api';
import {
  bootstrapCatalog,
  getAdminPricingConfig,
  getTenantVisibilityDiagnostics,
  normalizeInStockStatuses,
  syncCatalog,
  resetCatalog,
  updateAdminPricingConfig,
  type TenantVisibilityDiagnostics,
} from '../services/catalog';
import type { CatalogBootstrapResponse, CatalogSyncResponse } from '../types';
import { DEFAULT_MARGIN_INPUT, parsePositiveNumberInput } from '../constants/pricing';
import { logClientError } from '../utils/observability';

type AdminMe = {
  id: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'STAFF';
  storeId?: string | null;
  resolvedStoreId?: string | null;
  scopeMode?: 'session-store-scoped' | 'request-store-scoped' | 'global-admin' | 'unscoped' | string;
};

const SUPPORTED_TCGS = ['MAGIC', 'POKEMON', 'YUGIOH', 'ONE_PIECE', 'DIGIMON', 'WEISS_SCHWARZ'] as const;
type SupportedTcg = (typeof SUPPORTED_TCGS)[number];

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
  const pricingConfigQuery = useAsync(() => getAdminPricingConfig(), false);
  const tenantVisibilityQuery = useAsync(() => getTenantVisibilityDiagnostics(5));
  const adminMeQuery = useAsync(async () => {
    const { data } = await apiClient.get('/admin/auth/me');
    return (data?.data ?? null) as AdminMe | null;
  });
  const canManageAdminActions = adminMeQuery.data?.role === 'ADMIN' && !adminMeQuery.data?.storeId;
  const [catalogTcg, setCatalogTcg] = useState<SupportedTcg | ''>('');
  const [setCode, setSetCode] = useState('');
  const [setLimit, setSetLimit] = useState('');
  const [initialQuantity, setInitialQuantity] = useState('0');
  const [marginMultiplier, setMarginMultiplier] = useState(DEFAULT_MARGIN_INPUT);
  const [concurrency, setConcurrency] = useState('4');
  const [dryRun, setDryRun] = useState(false);
  const [createListings, setCreateListings] = useState(true);
  const [catalogActionLoading, setCatalogActionLoading] = useState<'bootstrap' | 'sync' | null>(null);
  const [catalogActionResult, setCatalogActionResult] = useState<{
    kind: 'bootstrap' | 'sync';
    payload: CatalogBootstrapResponse | CatalogSyncResponse;
  } | null>(null);
  const [catalogActionError, setCatalogActionError] = useState<string | null>(null);
  const [configMargin, setConfigMargin] = useState(DEFAULT_MARGIN_INPUT);
  const [applyMarginToExisting, setApplyMarginToExisting] = useState(true);
  const [importSetSyncPricesDefault, setImportSetSyncPricesDefault] = useState(false);
  const [exchangeRateMode, setExchangeRateMode] = useState<'api' | 'manual'>('api');
  const [manualUsdToClp, setManualUsdToClp] = useState('950');
  const [savingPricingConfig, setSavingPricingConfig] = useState(false);
  const [pricingConfigMsg, setPricingConfigMsg] = useState<string | null>(null);
  const [pricingConfigErr, setPricingConfigErr] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [normalizeLoading, setNormalizeLoading] = useState(false);
  const [normalizeMessage, setNormalizeMessage] = useState<string | null>(null);
  const [normalizeError, setNormalizeError] = useState<string | null>(null);

  const pricingConfigData = pricingConfigQuery.data as {
    success: boolean;
    config?: {
      defaultMarginMultiplier: number;
      exchangeRate: { mode: 'api' | 'manual'; activeRate: number };
    };
  } | null;
  const tenantVisibilityData = tenantVisibilityQuery.data as TenantVisibilityDiagnostics | null;
  const handleRefresh = () => window.location.reload();

  const handleNormalizeLegacyListings = async () => {
    const scopeStoreId = tenantVisibilityData?.diagnostics.resolvedStoreId || adminMeQuery.data?.resolvedStoreId || adminMeQuery.data?.storeId || undefined;
    if (!scopeStoreId) {
      setNormalizeError('Necesitas una tienda resuelta para normalizar listings legacy.');
      setNormalizeMessage(null);
      return;
    }

    setNormalizeLoading(true);
    setNormalizeError(null);
    setNormalizeMessage(null);

    try {
      const result = await normalizeInStockStatuses(scopeStoreId);
      setNormalizeMessage(`Se normalizaron ${result.updated} listing(s) con stock en ${result.scopeStoreId}.`);
      await tenantVisibilityQuery.execute();
    } catch (err) {
      setNormalizeError(logClientError('admin.normalizeInStockStatuses', err));
    } finally {
      setNormalizeLoading(false);
    }
  };

  useEffect(() => {
    if (!canManageAdminActions) return;
    if (pricingConfigQuery.status === 'idle') {
      void pricingConfigQuery.execute();
    }
  }, [canManageAdminActions, pricingConfigQuery.status]);

  const handleSavePricingConfig = async () => {
    setSavingPricingConfig(true);
    setPricingConfigErr(null);
    setPricingConfigMsg(null);
    try {
      const margin = parsePositiveNumberInput(configMargin);
      const manualRate = parsePositiveNumberInput(manualUsdToClp);

      if (!margin) {
        setPricingConfigErr('El margen por defecto debe ser un numero mayor a 0 (ej: 1.00).');
        return;
      }

      if (exchangeRateMode === 'manual' && !manualRate) {
        setPricingConfigErr('El tipo de cambio manual debe ser un numero mayor a 0.');
        return;
      }

      const result = await updateAdminPricingConfig({
        defaultMarginMultiplier: margin,
        applyMarginToExisting,
        exchangeRateMode,
        manualUsdToClp: exchangeRateMode === 'manual' ? manualRate || undefined : undefined,
        importSetSyncPricesDefault: importSetSyncPricesDefault,
      });

      setPricingConfigMsg(`Configuración guardada. Margen actualizado en ${(result as { updatedMargins?: number }).updatedMargins ?? 0} listing(s).`);
      pricingConfigQuery.execute();
    } catch (err: unknown) {
      setPricingConfigErr(err instanceof Error ? err.message : 'No se pudo guardar configuración');
      logClientError({
        area: 'admin-dashboard-page',
        action: 'save-pricing-config',
        message: 'Failed saving pricing configuration',
        error: err,
      });
    } finally {
      setSavingPricingConfig(false);
    }
  };

  useEffect(() => {
    if (pricingConfigData?.config) {
      setConfigMargin(String(pricingConfigData.config.defaultMarginMultiplier));
      setExchangeRateMode(pricingConfigData.config.exchangeRate.mode);
      setManualUsdToClp(String(pricingConfigData.config.exchangeRate.activeRate));
      // initialize import-set sync default from backend if present
      const cfgAny = pricingConfigData.config as any;
      if (cfgAny.importSetSyncPricesDefault !== undefined) {
        setImportSetSyncPricesDefault(Boolean(cfgAny.importSetSyncPricesDefault));
      }
    }
  }, [pricingConfigData]);

  const handleBootstrapCatalog = async () => {
    setCatalogActionLoading('bootstrap');
    setCatalogActionError(null);
    try {
      const tcg = catalogTcg && SUPPORTED_TCGS.includes(catalogTcg)
        ? catalogTcg
        : undefined;
      const payload = await bootstrapCatalog({
        tcg,
        setCode: setCode.trim() || undefined,
        setLimit: setLimit ? Number.parseInt(setLimit, 10) : undefined,
        dryRun,
        createListings,
        initialQuantity: Number.parseInt(initialQuantity || '0', 10),
        marginMultiplier: Number.parseFloat(marginMultiplier || DEFAULT_MARGIN_INPUT),
      });
      setCatalogActionResult({ kind: 'bootstrap', payload });
    } catch (err: unknown) {
      setCatalogActionError(err instanceof Error ? err.message : 'Error en carga inicial de catálogo');
      logClientError({
        area: 'admin-dashboard-page',
        action: 'bootstrap-catalog',
        message: 'Failed running catalog bootstrap',
        context: { tcg: catalogTcg || null, setCode: setCode || null, dryRun, createListings },
        error: err,
      });
    } finally {
      setCatalogActionLoading(null);
    }
  };

  const handleSyncCatalog = async () => {
    setCatalogActionLoading('sync');
    setCatalogActionError(null);
    try {
      const tcg = catalogTcg && SUPPORTED_TCGS.includes(catalogTcg)
        ? catalogTcg
        : undefined;
      const payload = await syncCatalog({
        tcg,
        dryRun,
        createListings,
        initialQuantity: Number.parseInt(initialQuantity || '0', 10),
        marginMultiplier: Number.parseFloat(marginMultiplier || DEFAULT_MARGIN_INPUT),
        concurrency: Number.parseInt(concurrency || '4', 10),
      });
      setCatalogActionResult({ kind: 'sync', payload });
    } catch (err: unknown) {
      setCatalogActionError(err instanceof Error ? err.message : 'Error al sincronizar catálogo');
      logClientError({
        area: 'admin-dashboard-page',
        action: 'sync-catalog',
        message: 'Failed syncing catalog',
        context: { tcg: catalogTcg || null, dryRun, createListings },
        error: err,
      });
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
      logClientError({
        area: 'admin-dashboard-page',
        action: 'reset-catalog',
        message: 'Failed resetting catalog',
        error: err,
      });
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
          <Link to="/admin/pricing/thresholds" style={{ padding: '6px 14px', borderRadius: 4, border: '1px solid #1976d2', background: '#e8f0ff', color: '#1976d2', textDecoration: 'none', display: 'inline-block' }}>
            ⚖️ Umbrales
          </Link>
          <Link to="/admin/approvals" style={{ padding: '6px 14px', borderRadius: 4, border: '1px solid #ff9800', background: '#fff4e5', color: '#ff9800', textDecoration: 'none', display: 'inline-block' }}>
            🛟 Aprobaciones
          </Link>
          {canManageAdminActions ? (
            <button onClick={() => setShowResetConfirm(true)} style={{ padding: '6px 14px', cursor: 'pointer', borderRadius: 4, border: '1px solid #d32f2f', background: '#ffebee', color: '#d32f2f', fontWeight: 500 }}>
              🗑️ Resetear BD
            </button>
          ) : null}
        </div>
      </div>

      <p style={{ marginTop: 0, color: 'var(--text-muted)' }}>
        Los resúmenes, alertas y sincronizaciones recientes se muestran en Dashboard. Aquí quedan solo los controles administrativos y de catálogo.
      </p>

      <Section title="🧭 Diagnóstico de Visibilidad por Tenant">
        <div className="surface-card" style={{ padding: 16, marginBottom: 16 }}>
          <p style={{ marginTop: 0, fontSize: 13, color: '#666' }}>
            Compara el volumen de listings visibles entre Inventario, Precios, Stock Bajo y Storefront para la tienda resuelta de tu sesión actual.
          </p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                tenantVisibilityQuery.execute();
              }}
              disabled={tenantVisibilityQuery.status === 'pending'}
            >
              {tenantVisibilityQuery.status === 'pending' ? '⏳ Consultando…' : '🔎 Recalcular diagnóstico'}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                void handleNormalizeLegacyListings();
              }}
              disabled={normalizeLoading}
            >
              {normalizeLoading ? '🛠️ Normalizando…' : '🛠️ Normalizar listings legacy'}
            </button>
            {tenantVisibilityData?.diagnostics ? (
              <span style={{ fontSize: 12, color: '#666' }}>
                Scope: <strong>{tenantVisibilityData.diagnostics.scopeMode}</strong> · Store: <strong>{tenantVisibilityData.diagnostics.resolvedStoreId || 'global'}</strong>
              </span>
            ) : null}
          </div>

          {normalizeMessage && (
            <div className="success-message" style={{ marginBottom: 12 }}>
              {normalizeMessage}
            </div>
          )}

          {normalizeError && (
            <div className="error-message" style={{ marginBottom: 12 }}>
              ⚠️ {normalizeError}
            </div>
          )}

          {tenantVisibilityQuery.status === 'error' && (
            <div className="error-message" style={{ marginBottom: 0 }}>
              ⚠️ No se pudo cargar el diagnóstico de visibilidad.
            </div>
          )}

          {tenantVisibilityData?.diagnostics && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 12 }}>
                <div className="surface-card" style={{ padding: 10 }}>
                  <div style={{ fontSize: 12, color: '#666' }}>Inventario</div>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{tenantVisibilityData.diagnostics.counts.inventoryListings}</div>
                </div>
                <div className="surface-card" style={{ padding: 10 }}>
                  <div style={{ fontSize: 12, color: '#666' }}>Precios</div>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{tenantVisibilityData.diagnostics.counts.pricingListings}</div>
                </div>
                <div className="surface-card" style={{ padding: 10 }}>
                  <div style={{ fontSize: 12, color: '#666' }}>Stock Bajo</div>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{tenantVisibilityData.diagnostics.counts.lowStockListings}</div>
                </div>
                <div className="surface-card" style={{ padding: 10 }}>
                  <div style={{ fontSize: 12, color: '#666' }}>Storefront</div>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{tenantVisibilityData.diagnostics.counts.storefrontListings}</div>
                </div>
                <div className="surface-card" style={{ padding: 10 }}>
                  <div style={{ fontSize: 12, color: '#666' }}>Ocultos por status</div>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{tenantVisibilityData.diagnostics.counts.hiddenByStatusListings ?? 0}</div>
                </div>
              </div>

              {tenantVisibilityData.diagnostics.counts.inventoryListings > tenantVisibilityData.diagnostics.counts.pricingListings ? (
                <div className="error-message" style={{ marginBottom: 8 }}>
                  ⚠️ Inventario tiene más listings que Precios. Revisa filtros de TCG/búsqueda y estados fuera de active/manual en la vista de Precios.
                </div>
              ) : (
                <div style={{ fontSize: 13, color: '#2e7d32', marginBottom: 8 }}>
                  ✓ Inventario y Precios se ven alineados para el scope actual.
                </div>
              )}

              {(tenantVisibilityData.diagnostics.counts.hiddenByStatusListings ?? 0) > 0 && (
                <div style={{ fontSize: 12, color: '#8a6d3b', marginBottom: 8 }}>
                  Hay listings con stock que no aparecen en Precios por su status actual. Ajusta su status a <strong>active</strong> o <strong>manual</strong>.
                </div>
              )}

              <div style={{ fontSize: 12, color: '#666' }}>
                Regla de Stock Bajo: cantidad {`<=`} {tenantVisibilityData.diagnostics.threshold} y {`>`} 0.
              </div>
            </>
          )}
        </div>
      </Section>

      {canManageAdminActions && pricingConfigQuery.status === 'pending' && (
        <div className="surface-card" style={{ padding: 12, marginBottom: 16 }}>
          ⏳ Cargando configuración de pricing...
        </div>
      )}

      {canManageAdminActions && pricingConfigQuery.status === 'error' && (
        <div className="error-message" style={{ marginBottom: 16 }}>
          ⚠️ No se pudo cargar la configuración de pricing.
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginLeft: 8 }}
            onClick={() => {
              pricingConfigQuery.execute();
            }}
          >
            Reintentar
          </button>
        </div>
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
          <p style={{ marginTop: 0, fontSize: 12, color: '#666' }}>
            Usa estos controles para hacer la carga inicial del catálogo o sincronizar sets nuevos sin duplicar métricas que ya viven en Dashboard.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4, fontWeight: 500 }}>TCG</label>
              <select value={catalogTcg} onChange={(e) => setCatalogTcg(e.target.value as SupportedTcg | '')} style={{ width: '100%', padding: '8px', borderRadius: 4, border: '1px solid #ddd' }}>
                <option value="">Todos los TCG</option>
                <option value="MAGIC">Magic</option>
                <option value="POKEMON">Pokémon</option>
                <option value="YUGIOH">Yu-Gi-Oh!</option>
                <option value="ONE_PIECE">One Piece</option>
                <option value="DIGIMON">Digimon Card Game</option>
                <option value="WEISS_SCHWARZ">Weiss Schwarz</option>
              </select>
              <div style={{ fontSize: 11, color: '#777', marginTop: 4 }}>
                Limita la operación a un juego. Si dejas "Todos", afecta todo el catálogo. En sincronización por ediciones, este selector define qué sets se consideran.
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
              <input placeholder={DEFAULT_MARGIN_INPUT} value={marginMultiplier} onChange={(e) => setMarginMultiplier(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: 4, border: '1px solid #ddd' }} type="number" step="0.1" min="0.1" />
              <div style={{ fontSize: 11, color: '#777', marginTop: 4 }}>
                Multiplicador sobre precio USD de referencia. 1.00 = sin recargo, 1.20 = +20%.
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
          {canManageAdminActions ? (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button type="button" onClick={handleBootstrapCatalog} disabled={catalogActionLoading !== null} style={{ padding: '10px 16px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 500 }}>
                {catalogActionLoading === 'bootstrap' ? '⏳ Cargando catálogo...' : '▶️ Carga inicial'}
              </button>
              <button type="button" onClick={handleSyncCatalog} disabled={catalogActionLoading !== null} style={{ padding: '10px 16px', background: '#388e3c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 500 }}>
                {catalogActionLoading === 'sync' ? '⏳ Sincronizando...' : '🔄 Sincronizar sets nuevos'}
              </button>
            </div>
          ) : (
            <div style={{ color: '#666', fontSize: 13 }}>
              Estas acciones están reservadas para ADMIN.
            </div>
          )}
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

          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, fontSize: 13 }}>
            <input type="checkbox" checked={importSetSyncPricesDefault} onChange={(e) => setImportSetSyncPricesDefault(e.target.checked)} />
            Sincronizar precios al importar set (por defecto)
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
            {canManageAdminActions ? (
              <button
                type="button"
                onClick={handleSavePricingConfig}
                disabled={savingPricingConfig}
                title="Guarda margen y configuración de dólar para precios"
                style={{ padding: '10px 16px', background: '#5d4037', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 500 }}
              >
                {savingPricingConfig ? '⏳ Guardando...' : '💾 Guardar parámetros'}
              </button>
            ) : (
              <span style={{ color: '#666', fontSize: 13 }}>Solo ADMIN puede guardar estos parámetros.</span>
            )}
            {pricingConfigMsg && <span style={{ color: '#2e7d32', fontSize: 13 }}>{pricingConfigMsg}</span>}
            {pricingConfigErr && <span style={{ color: '#c62828', fontSize: 13 }}>{pricingConfigErr}</span>}
          </div>
        </div>
      </Section>

    </div>
  );
}


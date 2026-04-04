import { useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import {
  bootstrapCatalog,
  getAdminDashboard,
  getPriceVolatility,
  getStockAlerts,
  getTcgplayerCoverage,
  syncCatalog,
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
  const volatilityQuery = useAsync(() => getPriceVolatility(10));
  const coverageQuery = useAsync(() => getTcgplayerCoverage());
  const [catalogTcg, setCatalogTcg] = useState<'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | ''>('');
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

  const dashboard = dashboardQuery.data as { success: boolean } & AdminDashboard | null;
  const coverage = coverageQuery.data as { success: boolean } & TcgplayerCoverage | null;
  const alerts = (alertsQuery.data as { alerts?: Array<{ listingId: string; cardName: string; editionCode: string; condition: string; quantity: number; finalPrice: number }> } | null)?.alerts ?? [];
  const volatileEvents = (volatilityQuery.data as { events?: Array<{ priceHistoryId: string; cardName: string; editionCode: string; oldPrice: number; newPrice: number; percentChange: number; createdAt: string }> } | null)?.events ?? [];

  const handleRefresh = () => window.location.reload();

  const handleBootstrapCatalog = async () => {
    setCatalogActionLoading('bootstrap');
    setCatalogActionError(null);
    try {
      const tcg = catalogTcg && ['MAGIC', 'POKEMON', 'YUGIOH'].includes(catalogTcg)
        ? (catalogTcg as 'MAGIC' | 'POKEMON' | 'YUGIOH')
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
      setCatalogActionError(err instanceof Error ? err.message : 'Bootstrap failed');
    } finally {
      setCatalogActionLoading(null);
    }
  };

  const handleSyncCatalog = async () => {
    setCatalogActionLoading('sync');
    setCatalogActionError(null);
    try {
      const tcg = catalogTcg && ['MAGIC', 'POKEMON', 'YUGIOH'].includes(catalogTcg)
        ? (catalogTcg as 'MAGIC' | 'POKEMON' | 'YUGIOH')
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
      setCatalogActionError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setCatalogActionLoading(null);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>Admin Dashboard</h2>
        <button onClick={handleRefresh} style={{ padding: '6px 14px', cursor: 'pointer' }}>
          Refresh
        </button>
      </div>

      {dashboardQuery.status === 'pending' && <p>Loading dashboard…</p>}
      {dashboardQuery.status === 'error' && (
        <p style={{ color: 'red' }}>
          Failed to load dashboard. Is the backend running?
        </p>
      )}

      <Section title="Catalog Sync Console">
        <div className="surface-card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <select value={catalogTcg} onChange={(e) => setCatalogTcg(e.target.value as any)}>
              <option value="">All TCGs</option>
              <option value="MAGIC">Magic</option>
              <option value="POKEMON">Pokémon</option>
              <option value="YUGIOH">Yu-Gi-Oh!</option>
            </select>
            <input placeholder="Set code (ej. MH3)" value={setCode} onChange={(e) => setSetCode(e.target.value)} />
            <input placeholder="Limit de sets" value={setLimit} onChange={(e) => setSetLimit(e.target.value)} />
            <input placeholder="Cantidad inicial" value={initialQuantity} onChange={(e) => setInitialQuantity(e.target.value)} />
            <input placeholder="Margen" value={marginMultiplier} onChange={(e) => setMarginMultiplier(e.target.value)} />
            <input placeholder="Concurrency" value={concurrency} onChange={(e) => setConcurrency(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
              Dry run
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={createListings} onChange={(e) => setCreateListings(e.target.checked)} />
              Crear listings
            </label>
            <button type="button" onClick={handleBootstrapCatalog} disabled={catalogActionLoading !== null}>
              {catalogActionLoading === 'bootstrap' ? 'Bootstrapping...' : 'Bootstrap catálogo'}
            </button>
            <button type="button" onClick={handleSyncCatalog} disabled={catalogActionLoading !== null}>
              {catalogActionLoading === 'sync' ? 'Syncing...' : 'Sync sets nuevos'}
            </button>
          </div>
          <p className="muted" style={{ marginTop: 12 }}>
            Esta consola permite poblar el catálogo histórico o sincronizar solo sets nuevos directamente desde el dashboard.
          </p>
        </div>

        {catalogActionError && <p style={{ color: '#b42318' }}>{catalogActionError}</p>}

        {catalogActionResult && (
          <div className="surface-card" style={{ padding: 16 }}>
            <strong>
              Resultado {catalogActionResult.kind === 'bootstrap' ? 'bootstrap' : 'sync'}
            </strong>
            <pre style={{ whiteSpace: 'pre-wrap', marginTop: 12, fontSize: 12 }}>
              {JSON.stringify(catalogActionResult.payload, null, 2)}
            </pre>
          </div>
        )}
      </Section>

      {dashboard && (
        <>
          {/* KPI cards */}
          <Section title="Catalog Overview">
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <KpiCard
                label="Total Cards"
                value={dashboard.kpis.catalog.totalCards.toLocaleString()}
                color="#1976d2"
              />
              <KpiCard
                label="Active Listings"
                value={dashboard.kpis.catalog.activeListings.toLocaleString()}
                sub={`of ${dashboard.kpis.catalog.totalListings} total`}
                color="#388e3c"
              />
              <KpiCard
                label="Low Stock"
                value={dashboard.kpis.catalog.lowStockListings.toLocaleString()}
                sub="≤5 units"
                color="#f57c00"
              />
              <KpiCard
                label="Out of Stock"
                value={dashboard.kpis.catalog.outOfStockListings.toLocaleString()}
                color="#d32f2f"
              />
              <KpiCard
                label="Inventory Value"
                value={`$${Math.round(dashboard.kpis.inventory.totalValueCLP / 1000).toLocaleString()}K`}
                sub="CLP (active listings)"
                color="#7b1fa2"
              />
              <KpiCard
                label="Orders"
                value={dashboard.kpis.orders.total.toLocaleString()}
                sub={`${dashboard.kpis.orders.pending} pending`}
                color="#0288d1"
              />
            </div>
          </Section>

          {coverage && (
            <Section title="TCGplayer Coverage">
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
                <KpiCard
                  label="Global Coverage"
                  value={`${coverage.global.coveragePercent.toFixed(2)}%`}
                  sub={`${coverage.global.coveredCards} / ${coverage.global.totalCards} cards`}
                  color="#5d4037"
                />
                <KpiCard
                  label="Missing IDs"
                  value={coverage.global.uncoveredCards.toLocaleString()}
                  sub="Cards pending productId"
                  color="#8d6e63"
                />
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={thStyle}>TCG</th>
                    <th style={thStyle}>Coverage</th>
                    <th style={thStyle}>Covered</th>
                    <th style={thStyle}>Missing</th>
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
            <Section title="Exchange Rate">
              <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: 16, display: 'inline-block' }}>
                <strong>1 USD = {dashboard.kpis.exchangeRate.usdToCLP.toLocaleString()} CLP</strong>
                <span style={{ marginLeft: 16, color: '#888', fontSize: 12 }}>
                  Source: {dashboard.kpis.exchangeRate.source}
                  {dashboard.kpis.exchangeRate.fetchedAt
                    ? ` · ${new Date(dashboard.kpis.exchangeRate.fetchedAt).toLocaleString()}`
                    : ''}
                </span>
              </div>
            </Section>
          )}

          {/* Recent imports */}
          {dashboard.recentImports.length > 0 && (
            <Section title="Recent Imports">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={thStyle}>File</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Records</th>
                    <th style={thStyle}>OK</th>
                    <th style={thStyle}>Errors</th>
                    <th style={thStyle}>Date</th>
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
            <Section title="Recent Price Sync Runs">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={thStyle}>Source</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Total</th>
                    <th style={thStyle}>Updated</th>
                    <th style={thStyle}>Volatile</th>
                    <th style={thStyle}>Failed</th>
                    <th style={thStyle}>Date</th>
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
        <Section title={`Low Stock Alerts (≤5 units)`}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#fff8e1' }}>
                <th style={thStyle}>Card</th>
                <th style={thStyle}>Edition</th>
                <th style={thStyle}>Condition</th>
                <th style={thStyle}>Qty</th>
                <th style={thStyle}>Price (CLP)</th>
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
      {volatilityQuery.status !== 'error' && volatileEvents.length > 0 && (
        <Section title="Recent Volatile Price Changes">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#fce4ec' }}>
                <th style={thStyle}>Card</th>
                <th style={thStyle}>Edition</th>
                <th style={thStyle}>Old Price</th>
                <th style={thStyle}>New Price</th>
                <th style={thStyle}>Change %</th>
                <th style={thStyle}>Date</th>
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

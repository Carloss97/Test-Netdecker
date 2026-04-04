import { useAsync } from '../hooks/useAsync';
import { getAdminDashboard, getStockAlerts, getPriceVolatility } from '../services/catalog';
import type { AdminDashboard } from '../types';

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

  const dashboard = dashboardQuery.data as { success: boolean } & AdminDashboard | null;
  const alerts = (alertsQuery.data as { alerts?: Array<{ listingId: string; cardName: string; editionCode: string; condition: string; quantity: number; finalPrice: number }> } | null)?.alerts ?? [];
  const volatileEvents = (volatilityQuery.data as { events?: Array<{ priceHistoryId: string; cardName: string; editionCode: string; oldPrice: number; newPrice: number; percentChange: number; createdAt: string }> } | null)?.events ?? [];

  const handleRefresh = () => window.location.reload();

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

import { useState, useEffect } from 'react';
import { useAsync } from '../hooks/useAsync';
import { getAdminDashboard } from '../services/catalog';
import apiClient from '../services/api';
import type { AdminDashboard } from '../types';
import { useSearchParams } from 'react-router-dom';

function formatClp(n: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
}

export function DashboardPage() {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'kpis' | 'analytics'>('kpis');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'analytics') setActiveTab('analytics');
    else setActiveTab('kpis');
  }, [searchParams]);

  const { data, status } = useAsync<AdminDashboard>(() => getAdminDashboard());

  const { data: summary, status: summaryStatus } = useAsync(async () => {
    const { data } = await apiClient.get('/analytics/sales-summary');
    return data.summary;
  });

  const { data: tcgData, status: tcgStatus } = useAsync(async () => {
    const { data } = await apiClient.get('/analytics/revenue-by-tcg');
    return data.data;
  });

  const fmtNum = (n: number) => new Intl.NumberFormat('es-CL').format(n);

  if (status === 'pending' || summaryStatus === 'pending' || tcgStatus === 'pending') {
    return <div className="loading-spinner">Sincronizando centro de control...</div>;
  }

  const kpis = data?.kpis;

  return (
    <div className="dashboard-container">
      {/* Tab Switcher */}
      <div className="tabs" style={{ marginBottom: 30, display: 'flex', gap: 10 }}>
        <button 
          className={`btn ${activeTab === 'kpis' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('kpis')}
        >
          🏠 Vista General (KPIs)
        </button>
        <button 
          className={`btn ${activeTab === 'analytics' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('analytics')}
        >
          📈 Análisis de Ventas e Insights
        </button>
      </div>

      {activeTab === 'kpis' ? (
        <div className="tab-content fade-in">
          {/* KPIs */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label">Total Cartas</div>
              <div className="kpi-value">{fmtNum(kpis?.catalog?.totalCards ?? 0)}</div>
              <div className="kpi-sub">en catálogo</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Listings Activos</div>
              <div className="kpi-value">{fmtNum(kpis?.catalog?.activeListings ?? 0)}</div>
              <div className="kpi-sub">con precio asignado</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Valor Inventario</div>
              <div className="kpi-value" style={{ fontSize: '1.3rem' }}>
                {formatClp(kpis?.inventory?.totalValueCLP ?? 0)}
              </div>
              <div className="kpi-sub">precio final × stock</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Stock Bajo</div>
              <div className="kpi-value" style={{ color: kpis?.catalog?.lowStockListings ? 'var(--warning)' : 'inherit' }}>
                {kpis?.catalog?.lowStockListings ?? 0}
              </div>
              <div className="kpi-sub">unidades críticas</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
            <div className="card">
              <div className="section-title" style={{ marginBottom: 12 }}>Importaciones Recientes</div>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Archivo</th>
                      <th>Estado</th>
                      <th>Registros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.recentImports || []).slice(0, 5).map((imp) => (
                      <tr key={imp.id}>
                        <td>{imp.fileName}</td>
                        <td><span className={`badge ${imp.status === 'completed' ? 'badge-green' : 'badge-red'}`}>{imp.status}</span></td>
                        <td>{imp.totalRecords}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <div className="section-title" style={{ marginBottom: 12 }}>Sincronizaciones</div>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Actualizados</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.recentSyncRuns || []).slice(0, 5).map((sync) => (
                      <tr key={sync.id}>
                        <td>{new Date(sync.startedAt).toLocaleDateString('es-CL')}</td>
                        <td>{sync.updated}</td>
                        <td><span className={`badge badge-green`}>{sync.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="tab-content fade-in">
          <div className="grid-cols-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 20, marginBottom: 30 }}>
            <div className="card" style={{ padding: 20, textAlign: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', fontWeight: 600 }}>Ingresos Totales</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--primary)' }}>{formatClp(summary?.totalRevenue || 0)}</div>
            </div>
            <div className="card" style={{ padding: 20, textAlign: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', fontWeight: 600 }}>Egresos Totales</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ef4444' }}>-{formatClp(summary?.totalExpenses || 0)}</div>
            </div>
            <div className="card" style={{ padding: 20, textAlign: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', fontWeight: 600 }}>Ganancia Bruta</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#10b981' }}>{formatClp(summary?.grossProfit || 0)}</div>
            </div>
            <div className="card" style={{ padding: 20, textAlign: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', fontWeight: 600 }}>Margen Promedio</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f59e0b' }}>{(summary?.profitMargin || 0).toFixed(1)}%</div>
            </div>
            <div className="card" style={{ padding: 20, textAlign: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', fontWeight: 600 }}>Órdenes Totales</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>{summary?.orderCount || 0}</div>
            </div>
          </div>

          <div className="grid-cols-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30 }}>
            <div className="card" style={{ padding: 25 }}>
              <h3 style={{ marginBottom: 20 }}>Ingresos por TCG</h3>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Juego (TCG)</th>
                      <th style={{ textAlign: 'right' }}>Ingresos (CLP)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(tcgData ?? []).map((item: any) => (
                      <tr key={item.name}>
                        <td style={{ fontWeight: 600 }}>{item.name}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatClp(item.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="card" style={{ padding: 25 }}>
              <h3 style={{ marginBottom: 20 }}>Distribución</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                {(tcgData ?? []).map((item: any) => {
                  const percentage = (item.revenue / (summary?.totalRevenue || 1)) * 100;
                  return (
                    <div key={item.name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 5 }}>
                        <span>{item.name}</span>
                        <span style={{ fontWeight: 700 }}>{percentage.toFixed(1)}%</span>
                      </div>
                      <div style={{ width: '100%', height: 12, background: 'var(--store-border)', borderRadius: 10, overflow: 'hidden' }}>
                        <div style={{ width: `${percentage}%`, height: '100%', background: 'var(--primary)' }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

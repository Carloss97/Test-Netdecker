import { useAsync } from '../hooks/useAsync';
import { getAdminDashboard } from '../services/catalog';
import type { AdminDashboard } from '../types';

export function DashboardPage() {
  const { data, status, error } = useAsync<AdminDashboard>(() => getAdminDashboard());

  const fmtCLP = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  const fmtNum = (n: number) => new Intl.NumberFormat('es-CL').format(n);

  if (status === 'pending') {
    return (
      <div className="loading-spinner">
        <span>⏳</span> Cargando dashboard…
      </div>
    );
  }

  if (status === 'error') {
    return <div className="error-message">⚠️ Error al cargar dashboard: {error?.message}</div>;
  }

  const kpis = data?.kpis;

  return (
    <div>
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
            {fmtCLP(kpis?.inventory?.totalValueCLP ?? 0)}
          </div>
          <div className="kpi-sub">precio final × stock</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Tipo de Cambio</div>
          <div className="kpi-value">{fmtNum(kpis?.exchangeRate?.usdToCLP ?? 0)}</div>
          <div className="kpi-sub">CLP por USD · {kpis?.exchangeRate?.source ?? '—'}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Stock Bajo</div>
          <div className="kpi-value" style={{ color: kpis?.catalog?.lowStockListings ? 'var(--warning)' : 'inherit' }}>
            {kpis?.catalog?.lowStockListings ?? 0}
          </div>
          <div className="kpi-sub">cartas con ≤2 unidades</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Sin Stock</div>
          <div className="kpi-value" style={{ color: kpis?.catalog?.outOfStockListings ? 'var(--danger)' : 'inherit' }}>
            {kpis?.catalog?.outOfStockListings ?? 0}
          </div>
          <div className="kpi-sub">listings agotados</div>
        </div>
      </div>

      {/* Recent imports + recent syncs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* Recent Imports */}
        <div className="card">
          <div className="section-title" style={{ marginBottom: 12 }}>Importaciones Recientes</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8 }}>
            Auditoría rápida de cargas CSV y catálogos: archivo, estado, volumen y fecha para detectar fallas tempranas.
          </div>
          {(!data?.recentImports || data.recentImports.length === 0) ? (
            <div className="empty-state" style={{ padding: '20px 0' }}>
              <div>No hay importaciones recientes</div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Archivo</th>
                    <th>Estado</th>
                    <th>Registros</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentImports.slice(0, 5).map((imp) => (
                    <tr key={imp.id}>
                      <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {imp.fileName}
                      </td>
                      <td>
                        <span className={`badge ${imp.status === 'completed' ? 'badge-green' : imp.status === 'failed' ? 'badge-red' : 'badge-yellow'}`}>
                          {imp.status}
                        </span>
                      </td>
                      <td>{imp.totalRecords}</td>
                      <td>{new Date(imp.createdAt).toLocaleDateString('es-CL')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Sync Runs */}
        <div className="card">
          <div className="section-title" style={{ marginBottom: 12 }}>Sincronizaciones de Precio</div>
          {(!data?.recentSyncRuns || data.recentSyncRuns.length === 0) ? (
            <div className="empty-state" style={{ padding: '20px 0' }}>
              <div>No hay sincronizaciones recientes</div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Estado</th>
                    <th>Actualizados</th>
                    <th>Errores</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentSyncRuns.slice(0, 5).map((sync) => (
                    <tr key={sync.id}>
                      <td>{new Date(sync.startedAt).toLocaleDateString('es-CL')}</td>
                      <td>
                        <span className={`badge ${sync.status === 'completed' ? 'badge-green' : sync.status === 'failed' ? 'badge-red' : 'badge-yellow'}`}>
                          {sync.status}
                        </span>
                      </td>
                      <td>{sync.updated}</td>
                      <td>{sync.failed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div className="card">
        <div className="section-title" style={{ marginBottom: 16 }}>Accesos Rápidos</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a href="/inventario" className="btn btn-primary">📦 Gestionar Inventario</a>
          <a href="/precios" className="btn btn-secondary">💰 Ver Precios</a>
          <a href="/importar" className="btn btn-secondary">📥 Importar Catálogo</a>
          <a href="/admin" className="btn btn-secondary">⚙️ Parámetros Admin</a>
        </div>
      </div>
    </div>
  );
}

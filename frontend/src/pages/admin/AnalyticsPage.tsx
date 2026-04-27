import { useAsync } from '../../hooks/useAsync';
import apiClient from '../../services/api';

function formatClp(n: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
}

export function AnalyticsPage() {
  const { data: summary, status: summaryStatus } = useAsync(async () => {
    const { data } = await apiClient.get('/analytics/sales-summary');
    return data.summary;
  });

  const { data: tcgData, status: tcgStatus } = useAsync(async () => {
    const { data } = await apiClient.get('/analytics/revenue-by-tcg');
    return data.data;
  });

  if (summaryStatus === 'pending' || tcgStatus === 'pending') {
    return <div className="loading-spinner">Analizando datos financieros...</div>;
  }

  return (
    <div className="analytics-page">
      <div className="grid-cols-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBottom: 30 }}>
        <div className="card" style={{ padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', fontWeight: 600 }}>Ingresos Totales</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--primary)' }}>{formatClp(summary?.totalRevenue || 0)}</div>
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
                {tcgData?.length === 0 && (
                  <tr><td colSpan={2} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Sin ventas registradas aún.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ padding: 25, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ fontSize: '4rem', marginBottom: 20 }}>📊</div>
          <h3>Próximamente: Gráficos Avanzados</h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: 300 }}>
            Estamos preparando integraciones con Chart.js para mostrar tendencias semanales y comparativas anuales.
          </p>
        </div>
      </div>
    </div>
  );
}

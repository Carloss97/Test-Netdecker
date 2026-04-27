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

        <div className="card" style={{ padding: 25 }}>
          <h3 style={{ marginBottom: 20 }}>Distribución de Ingresos</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            {(tcgData ?? []).map((item: any, idx: number) => {
              const maxRevenue = Math.max(...(tcgData ?? []).map((i: any) => i.revenue), 1);
              const percentage = (item.revenue / maxRevenue) * 100;
              const colors = ['#f77f00', '#3b82f6', '#10b981', '#6366f1', '#f59e0b'];
              
              return (
                <div key={item.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 5 }}>
                    <span>{item.name}</span>
                    <span style={{ fontWeight: 700 }}>{((item.revenue / (summary?.totalRevenue || 1)) * 100).toFixed(1)}%</span>
                  </div>
                  <div style={{ width: '100%', height: 12, background: 'var(--store-border)', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ 
                      width: `${percentage}%`, 
                      height: '100%', 
                      background: colors[idx % colors.length],
                      transition: 'width 1s ease-in-out'
                    }}></div>
                  </div>
                </div>
              );
            })}
            {(!tcgData || tcgData.length === 0) && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                No hay datos suficientes para generar gráficos.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

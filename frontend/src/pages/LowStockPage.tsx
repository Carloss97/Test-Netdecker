import { useEffect, useState } from 'react';
import { getLowStockListings } from '../services/catalog';
import type { Listing } from '../types';

export function LowStockPage() {
  const [thresholdInput, setThresholdInput] = useState('5');
  const [threshold, setThreshold] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);

  const fmtCLP = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  const loadLowStock = async (nextThreshold: number) => {
    setLoading(true);
    setError(null);

    try {
      const data = await getLowStockListings(nextThreshold);
      setListings(data || []);
    } catch (err) {
      setError((err as Error).message || 'No se pudo cargar el listado de stock bajo');
      setListings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLowStock(threshold);
  }, [threshold]);

  const onApplyThreshold = () => {
    const parsed = Number.parseInt(thresholdInput, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setError('El umbral debe ser un numero entero mayor o igual a 1.');
      return;
    }

    setThreshold(parsed);
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title" style={{ marginBottom: 8 }}>Alertas de Stock Bajo</div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
          Lista de listings activos con cantidad menor o igual al umbral definido.
        </p>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label htmlFor="low-stock-threshold" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Umbral
          </label>
          <input
            id="low-stock-threshold"
            type="number"
            min="1"
            className="input"
            style={{ width: 110 }}
            value={thresholdInput}
            onChange={(e) => setThresholdInput(e.target.value)}
          />
          <button type="button" className="btn btn-primary" onClick={onApplyThreshold} disabled={loading}>
            Aplicar
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void loadLowStock(threshold)} disabled={loading}>
            Reintentar
          </button>
        </div>
      </div>

      {loading && (
        <div className="loading-spinner">
          <span>⏳</span> Cargando stock bajo...
        </div>
      )}

      {!loading && error && (
        <div className="error-message">
          ⚠️ Error al cargar stock bajo: {error}
        </div>
      )}

      {!loading && !error && listings.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">✅</div>
          <h3>Sin alertas con el umbral actual</h3>
          <p>No hay listings activos con stock menor o igual a {threshold}.</p>
        </div>
      )}

      {!loading && !error && listings.length > 0 && (
        <div className="card">
          <div className="section-title" style={{ marginBottom: 12 }}>
            {listings.length} listing(s) en alerta (umbral: {threshold})
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Carta</th>
                  <th>Codigo</th>
                  <th>Condicion</th>
                  <th>Stock</th>
                  <th>Precio CLP</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((listing) => (
                  <tr key={listing.id}>
                    <td>{listing.card?.cardName || 'Sin nombre'}</td>
                    <td>{listing.card?.cardCode || '—'}</td>
                    <td>{listing.condition}</td>
                    <td>
                      <span className={`badge ${listing.quantity <= 2 ? 'badge-red' : 'badge-yellow'}`}>
                        {listing.quantity}
                      </span>
                    </td>
                    <td>{fmtCLP(listing.finalPrice || 0)}</td>
                    <td>
                      <span className={`badge ${listing.status === 'manual' ? 'badge-purple' : 'badge-blue'}`}>
                        {listing.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

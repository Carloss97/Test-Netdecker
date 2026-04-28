import { useEffect, useRef, useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import { 
  getAvailableListings, 
  getLowStockListings,
  getTCGs,
  listExternalSets,
  importExternalSet,
  validateInventoryCsv,
  importInventoryCsv,
  getInventoryImports
} from '../services/catalog';
import type { Listing, AdminDashboard } from '../types';

export function CatalogPage() {
  const [activeTab, setActiveTab] = useState<'inventory' | 'alerts' | 'import'>('inventory');
  
  // Inventory Tab State
  type TcgFilter = 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ';
  const [selectedTcg, setSelectedTcg] = useState<TcgFilter>('MAGIC');
  const [listingSearch, setListingSearch] = useState('');
  const [previewListingId, setPreviewListingId] = useState<string | null>(null);
  
  // Alerts Tab State
  const [threshold, setThreshold] = useState(5);
  
  // Import Tab State
  const [catalogTcg, setCatalogTcg] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  const { data: listings, status: listingsStatus, execute: reloadListings } = useAsync<Listing[]>(() => getAvailableListings());
  const { data: tcgs } = useAsync(() => getTCGs());
  const { data: alerts, status: alertsStatus, execute: reloadAlerts } = useAsync(() => getLowStockListings(threshold), true);
  const { data: imports, execute: reloadImports } = useAsync(() => getInventoryImports({ pageSize: 5 }));

  const fmtCLP = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  const filteredListings = (listings ?? []).filter((l: any) => {
    const tcgName = l.tcgName || l.card?.tcg?.name;
    if (tcgName !== selectedTcg) return false;
    const q = listingSearch.trim().toLowerCase();
    return !q || (l.cardName || l.card?.cardName || '').toLowerCase().includes(q) || (l.cardCode || l.card?.cardCode || '').toLowerCase().includes(q);
  });

  const previewListing: any = filteredListings.find(l => l.id === previewListingId) || filteredListings[0];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setCsvFile(file);
  };

  const handleImport = async () => {
    if (!csvFile) return alert('Selecciona un archivo CSV');
    setIsImporting(true);
    try {
      const res = await importInventoryCsv(csvFile);
      setImportResult(res);
      alert('Importación completada con éxito');
      setCsvFile(null);
      void reloadImports();
      void reloadListings();
    } catch (err: any) {
      alert('Error al importar: ' + (err.message || 'Error desconocido'));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="stock-hub">
      <div className="tabs" style={{ marginBottom: 25, display: 'flex', gap: 10 }}>
        <button className={`btn ${activeTab === 'inventory' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('inventory')}>💎 Catálogo Maestro</button>
        <button className={`btn ${activeTab === 'alerts' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('alerts')}>🚨 Alertas de Stock Bajo</button>
        <button className={`btn ${activeTab === 'import' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('import')}>📥 Importar y Cargas</button>
      </div>

      {activeTab === 'inventory' && (
        <div className="tab-content fade-in">
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <input className="input input-sm" style={{ flex: 1 }} value={listingSearch} onChange={e => setListingSearch(e.target.value)} placeholder="Buscar carta..." />
              <div className="btn-group">
                {(['MAGIC', 'POKEMON', 'YUGIOH', 'ONE_PIECE', 'DIGIMON', 'WEISS_SCHWARZ'] as const).map(tcg => (
                  <button key={tcg} className={`btn btn-sm ${selectedTcg === tcg ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSelectedTcg(tcg)}>{tcg}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="listings-preview-pane" style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: 24, alignItems: 'start' }}>
            <div className="table-wrapper card" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 16 }}>Carta</th>
                    <th>Metadatos</th>
                    <th>Stock</th>
                    <th>Precio</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredListings.map((l: any) => (
                    <tr key={l.id} onMouseEnter={() => setPreviewListingId(l.id)} className={previewListing?.id === l.id ? 'row-preview-active' : ''}>
                      <td style={{ paddingLeft: 16 }}>
                        <div style={{ fontWeight: 600 }}>{l.cardName || l.card?.cardName}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{l.cardCode || l.card?.cardCode}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <span className="badge badge-blue" style={{ fontSize: '0.6rem' }}>{l.cardType}</span>
                          <span className="badge badge-purple" style={{ fontSize: '0.6rem' }}>{l.attribute}</span>
                        </div>
                      </td>
                      <td><span className={`badge ${l.quantity > 5 ? 'badge-green' : 'badge-yellow'}`}>{l.quantity} uds</span></td>
                      <td style={{ fontWeight: 700 }}>{fmtCLP(l.finalPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <aside className="inventory-preview-panel card" style={{ position: 'sticky', top: 20, padding: 20 }}>
              {previewListing ? (
                <>
                  <div className="inventory-preview-frame">
                    <img src={previewListing.imageUrl || previewListing.card?.imageUrl} alt="" style={{ width: '100%', borderRadius: 8 }} />
                  </div>
                  <h3 style={{ marginTop: 15 }}>{previewListing.cardName || previewListing.card?.cardName}</h3>
                  <div className="badge badge-gray">{previewListing.editionName || 'Sin edición'}</div>
                  <div style={{ marginTop: 20, paddingTop: 15, borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Precio Final:</span>
                      <span style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '1.2rem' }}>{fmtCLP(previewListing.finalPrice)}</span>
                    </div>
                  </div>
                </>
              ) : <div className="empty-state">Selecciona una carta</div>}
            </aside>
          </div>
        </div>
      )}

      {activeTab === 'alerts' && (
        <div className="tab-content fade-in">
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="section-title">Umbral de Alerta</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
              <input type="number" className="input" style={{ width: 100 }} value={threshold} onChange={e => setThreshold(Number(e.target.value))} />
              <button className="btn btn-primary" onClick={() => reloadAlerts()}>Actualizar Alertas</button>
            </div>
          </div>
          <div className="table-wrapper card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Imagen</th>
                  <th>Carta</th>
                  <th>Stock Actual</th>
                  <th>Precio</th>
                </tr>
              </thead>
              <tbody>
                {(alerts ?? []).map((l: any) => (
                  <tr key={l.id}>
                    <td><img src={l.card?.imageUrl} alt="" style={{ height: 40, borderRadius: 4 }} /></td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{l.card?.cardName}</div>
                      <div style={{ fontSize: '0.75rem' }}>{l.card?.cardCode}</div>
                    </td>
                    <td><span className="badge badge-red">{l.quantity} uds</span></td>
                    <td>{fmtCLP(l.finalPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'import' && (
        <div className="tab-content fade-in">
          <div className="grid-cols-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="card">
              <div className="section-title">Carga de Stock (CSV)</div>
              <div className="upload-area" style={{ marginTop: 10, padding: 20, border: '2px dashed var(--border)', textAlign: 'center', borderRadius: 8 }}>
                <p>Sube tu archivo .csv con las columnas: <br/><code>listingId, quantity</code> o plantilla full-upsert.</p>
                <input type="file" accept=".csv" style={{ marginTop: 10 }} onChange={handleFileChange} />
                {csvFile && (
                  <div style={{ marginTop: 15 }}>
                    <button className="btn btn-primary" onClick={handleImport} disabled={isImporting}>
                      {isImporting ? '⌛ Cargando...' : '🚀 Iniciar Importación'}
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="card">
              <div className="section-title">Importar Catálogo Externo</div>
              <select className="input" style={{ marginTop: 10 }} value={catalogTcg} onChange={e => setCatalogTcg(e.target.value)}>
                <option value="">Selecciona TCG</option>
                {(tcgs as any[])?.map(t => <option key={t.id} value={t.name}>{t.displayName}</option>)}
              </select>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 10 }}>Usa esta opción para traer cartas nuevas desde TCGPlayer o Scryfall.</p>
            </div>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <div className="section-title">Historial Reciente</div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Archivo</th>
                    <th>Estado</th>
                    <th>OK</th>
                    <th>Fallos</th>
                  </tr>
                </thead>
                <tbody>
                  {(imports as any)?.items?.map((imp: any) => (
                    <tr key={imp.id}>
                      <td>{imp.fileName}</td>
                      <td><span className={`badge ${imp.status === 'completed' ? 'badge-green' : 'badge-red'}`}>{imp.status}</span></td>
                      <td>{imp.successCount}</td>
                      <td>{imp.failureCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

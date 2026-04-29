import { useEffect, useRef, useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import { 
  getAvailableListings, 
  getLowStockListings,
  getTCGs,
  listExternalSets,
  importExternalSet,
  importInventoryCsv,
  getInventoryImports,
  getEditions,
  searchCards,
  searchCardsByCode,
  getListingsByCard,
  updateListingPricingMode,
  updateListingStock,
  exportInventoryCsv
} from '../services/catalog';
import type { Listing, EditionWithCounts, Card } from '../types';
import apiClient from '../services/api';
import ModeToggle from '../components/ModeToggle';

function fmtCLP(n: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
}

export function CatalogPage() {
  const [activeTab, setActiveTab] = useState<'inventory' | 'search' | 'alerts' | 'import' | 'export'>('inventory');
  
  // ─── Inventario Tab State ──────────────────────────────────────────────────
  type TcgFilter = 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ';
  const [selectedTcg, setSelectedTcg] = useState<TcgFilter>('MAGIC');
  const [listingSearch, setListingSearch] = useState('');
  const [previewListingId, setPreviewListingId] = useState<string | null>(null);
  
  // ─── Buscador Maestro Tab State ─────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'name' | 'code'>('name');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [cardListings, setCardListings] = useState<Record<string, Listing[]>>({});

  // ─── Alertas Tab State ─────────────────────────────────────────────────────
  const [threshold, setThreshold] = useState(5);
  
  // ─── Import Tab State ──────────────────────────────────────────────────────
  const [catalogTcg, setCatalogTcg] = useState('MAGIC');
  const [externalSets, setExternalSets] = useState<any[]>([]);
  const [loadingSets, setLoadingSets] = useState(false);
  const [importingSet, setImportingSet] = useState<string | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // ─── Export Tab State ──────────────────────────────────────────────────────
  const [exportTcg, setExportTcg] = useState('MAGIC');
  const [exportEditionId, setExportEditionId] = useState('');
  const [availableEditions, setAvailableEditions] = useState<EditionWithCounts[]>([]);

  const { data: listings, execute: reloadListings } = useAsync<Listing[]>(() => getAvailableListings());
  const { data: tcgs } = useAsync(() => getTCGs());
  const { data: alerts, execute: reloadAlerts } = useAsync(() => getLowStockListings(threshold), true);
  const { data: imports, execute: reloadImports } = useAsync(() => getInventoryImports({ pageSize: 5 }));

  useEffect(() => {
    if (activeTab === 'import' && catalogTcg) {
      setLoadingSets(true);
      listExternalSets(catalogTcg as any)
        .then(res => setExternalSets(Array.isArray(res) ? res : []))
        .catch(() => setExternalSets([]))
        .finally(() => setLoadingSets(false));
    }
  }, [activeTab, catalogTcg]);

  useEffect(() => {
    if (activeTab === 'export' && exportTcg) {
      getEditions({ tcgId: exportTcg, activeOnly: true }).then(setAvailableEditions);
    }
  }, [activeTab, exportTcg]);

  const filteredListings = (listings ?? []).filter((l: any) => {
    const tcgName = l.tcgName || l.card?.tcg?.name;
    if (tcgName !== selectedTcg) return false;
    const q = listingSearch.trim().toLowerCase();
    return !q || (l.cardName || l.card?.cardName || '').toLowerCase().includes(q) || (l.cardCode || l.card?.cardCode || '').toLowerCase().includes(q);
  });

  const previewListing: any = filteredListings.find(l => l.id === previewListingId) || filteredListings[0];

  // ─── Handlers ───────────────────────────────────────────────────────────────
  
  const handleGlobalSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const data = searchMode === 'code' ? await searchCardsByCode(searchQuery) : await searchCards(searchQuery);
      setSearchResults(Array.isArray(data) ? data : []);
    } finally { setIsSearching(false); }
  };

  const toggleCardListings = async (cardId: string) => {
    if (expandedCard === cardId) { setExpandedCard(null); return; }
    setExpandedCard(cardId);
    if (!cardListings[cardId]) {
      const res = await getListingsByCard(cardId);
      setCardListings(prev => ({ ...prev, [cardId]: res }));
    }
  };

  const handleImportSet = async (setCode: string) => {
    setImportingSet(setCode);
    try {
      await importExternalSet(catalogTcg as any, setCode);
      alert('Set importado con éxito');
      void reloadListings();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setImportingSet(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setCsvFile(file);
  };

  const handleImportCsv = async () => {
    if (!csvFile) return alert('Selecciona un archivo');
    setIsImporting(true);
    try {
      await importInventoryCsv(csvFile);
      alert('CSV procesado correctamente');
      setCsvFile(null);
      void reloadImports();
      void reloadListings();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleExport = async () => {
    try {
      const blob = await exportInventoryCsv({
        scope: exportEditionId ? 'edition' : 'tcg',
        tcgId: exportTcg,
        editionId: exportEditionId || undefined
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventario-${exportTcg}-${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Error al exportar: ' + err.message);
    }
  };

  return (
    <div className="stock-hub">
      <div className="tabs" style={{ marginBottom: 25, display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 5 }}>
        <button className={`btn ${activeTab === 'inventory' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('inventory')}>💎 Inventario</button>
        <button className={`btn ${activeTab === 'search' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('search')}>🔍 Buscador Maestro</button>
        <button className={`btn ${activeTab === 'alerts' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('alerts')}>🚨 Stock Bajo</button>
        <button className={`btn ${activeTab === 'import' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('import')}>📥 Importar</button>
        <button className={`btn ${activeTab === 'export' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('export')}>📤 Exportar</button>
      </div>

      {activeTab === 'inventory' && (
        <div className="tab-content fade-in">
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <input className="input input-sm" style={{ flex: 1 }} value={listingSearch} onChange={e => setListingSearch(e.target.value)} placeholder="Buscar carta en stock..." />
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
                <thead><tr><th style={{ paddingLeft: 16 }}>Carta</th><th>Tags</th><th>Stock</th><th>Precio</th></tr></thead>
                <tbody>
                  {filteredListings.map((l: any) => (
                    <tr key={l.id} onMouseEnter={() => setPreviewListingId(l.id)} className={previewListing?.id === l.id ? 'row-preview-active' : ''}>
                      <td style={{ paddingLeft: 16 }}>
                        <div style={{ fontWeight: 600 }}>{l.cardName || l.card?.cardName}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{l.cardCode || l.card?.cardCode}</div>
                      </td>
                      <td>{l.cardType && <span className="badge badge-blue" style={{ fontSize: '0.6rem' }}>{l.cardType}</span>}</td>
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
                  <img src={previewListing.imageUrl || previewListing.card?.imageUrl} alt="" style={{ width: '100%', borderRadius: 8 }} />
                  <h3 style={{ marginTop: 15 }}>{previewListing.cardName || previewListing.card?.cardName}</h3>
                  <div className="badge badge-gray">{previewListing.editionName}</div>
                  <div style={{ marginTop: 20, fontWeight: 800, color: 'var(--primary)', fontSize: '1.2rem' }}>{fmtCLP(previewListing.finalPrice)}</div>
                </>
              ) : <div className="empty-state">Selecciona una carta</div>}
            </aside>
          </div>
        </div>
      )}

      {activeTab === 'search' && (
        <div className="tab-content fade-in">
          <div className="card">
            <form onSubmit={handleGlobalSearch} style={{ display: 'flex', gap: 10 }}>
              <select className="input" style={{ width: 150 }} value={searchMode} onChange={e => setSearchMode(e.target.value as any)}>
                <option value="name">Por Nombre</option>
                <option value="code">Por Código</option>
              </select>
              <input className="input" style={{ flex: 1 }} placeholder="Charizard, OP01-001..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              <button className="btn btn-primary" disabled={isSearching}>Buscar</button>
            </form>
          </div>
          <div style={{ marginTop: 20 }}>
            {searchResults.map(card => (
              <div key={card.id} className="card" style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 15, alignItems: 'center' }}>
                  <img src={card.imageUrl} alt="" style={{ height: 60, borderRadius: 4 }} />
                  <div style={{ flex: 1 }}>
                    <b>{card.cardName}</b><br/>
                    <small>{card.cardCode} · {card.edition?.editionName}</small>
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => toggleCardListings(card.id)}>
                    {expandedCard === card.id ? 'Ocultar' : 'Ver Listings'}
                  </button>
                </div>
                {expandedCard === card.id && (
                  <div style={{ marginTop: 15, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <table className="data-table">
                      <thead><tr><th>Condición</th><th>Stock</th><th>Precio</th></tr></thead>
                      <tbody>
                        {(cardListings[card.id] || []).map(l => (
                          <tr key={l.id}>
                            <td>{l.condition}</td>
                            <td>{l.quantity}</td>
                            <td>{fmtCLP(l.finalPrice)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'alerts' && (
        <div className="tab-content fade-in card">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
            <label>Umbral:</label>
            <input type="number" className="input" style={{ width: 80 }} value={threshold} onChange={e => setThreshold(Number(e.target.value))} />
            <button className="btn btn-primary" onClick={() => reloadAlerts()}>Actualizar</button>
          </div>
          <table className="data-table">
            <thead><tr><th>Imagen</th><th>Carta</th><th>Stock</th><th>Precio</th></tr></thead>
            <tbody>
              {(alerts ?? []).map((l: any) => (
                <tr key={l.id}>
                  <td><img src={l.card?.imageUrl} alt="" style={{ height: 40 }} /></td>
                  <td><b>{l.card?.cardName}</b><br/><small>{l.card?.cardCode}</small></td>
                  <td><span className="badge badge-red">{l.quantity}</span></td>
                  <td>{fmtCLP(l.finalPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'import' && (
        <div className="tab-content fade-in">
          <div className="grid-cols-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="card">
              <h3>1. Importar Set desde API</h3>
              <select className="input" style={{ marginTop: 10 }} value={catalogTcg} onChange={e => setCatalogTcg(e.target.value)}>
                <option value="MAGIC">Magic</option><option value="POKEMON">Pokémon</option><option value="YUGIOH">Yu-Gi-Oh</option><option value="ONE_PIECE">One Piece</option>
              </select>
              <div className="table-wrapper" style={{ marginTop: 15, maxHeight: 300, overflowY: 'auto' }}>
                {loadingSets ? <p>Cargando sets...</p> : (
                  <table className="data-table">
                    <tbody>
                      {Array.isArray(externalSets) && externalSets.map(s => (
                        <tr key={s.code}>
                          <td><b>{s.code}</b> - {s.name}</td>
                          <td style={{ textAlign: 'right' }}>
                            <button className="btn btn-sm btn-primary" onClick={() => handleImportSet(s.code)} disabled={!!importingSet}>
                              {importingSet === s.code ? '⌛' : '📥'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            <div className="card">
              <h3>2. Carga de Stock (CSV)</h3>
              <div style={{ marginTop: 15, padding: 20, border: '2px dashed var(--border)', textAlign: 'center' }}>
                <input type="file" accept=".csv" onChange={handleFileChange} />
                {csvFile && (
                  <button className="btn btn-primary" style={{ marginTop: 15, width: '100%' }} onClick={handleImportCsv} disabled={isImporting}>
                    {isImporting ? '⌛ Procesando...' : '🚀 Iniciar Importación'}
                  </button>
                )}
              </div>
              <h3 style={{ marginTop: 25 }}>Historial Reciente</h3>
              <table className="data-table" style={{ marginTop: 10 }}>
                <tbody>
                  {Array.isArray((imports as any)?.items) && (imports as any).items.map((imp: any) => (
                    <tr key={imp.id}>
                      <td><small>{imp.fileName}</small></td>
                      <td><span className={`badge ${imp.status === 'completed' ? 'badge-green' : 'badge-red'}`}>{imp.status}</span></td>
                      <td>{imp.successCount} OK</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'export' && (
        <div className="tab-content fade-in card" style={{ maxWidth: 500 }}>
          <h3>Exportar Inventario</h3>
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 15 }}>
            <div>
              <label>Seleccionar TCG:</label>
              <select className="input" value={exportTcg} onChange={e => setExportTcg(e.target.value)}>
                <option value="MAGIC">Magic</option><option value="POKEMON">Pokémon</option><option value="YUGIOH">Yu-Gi-Oh</option><option value="ONE_PIECE">One Piece</option>
              </select>
            </div>
            <div>
              <label>Edición Específica (Opcional):</label>
              <select className="input" value={exportEditionId} onChange={e => setExportEditionId(e.target.value)}>
                <option value="">Todas las ediciones de {exportTcg}</option>
                {availableEditions.map(ed => <option key={ed.id} value={ed.id}>{ed.editionName}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" onClick={handleExport} style={{ marginTop: 10 }}>📥 Generar y Descargar</button>
          </div>
        </div>
      )}
    </div>
  );
}

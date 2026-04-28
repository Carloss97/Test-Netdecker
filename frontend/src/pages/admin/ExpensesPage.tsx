import { useState, useEffect, useRef } from 'react';
import { useAsync } from '../../hooks/useAsync';
import apiClient from '../../services/api';
import { syncListingPrices, getPriceVolatility, getEditions } from '../../services/catalog';
import type { EditionWithCounts } from '../../types';

function formatClp(n: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
}

export function ExpensesPage() {
  const [activeHubTab, setActiveHubTab] = useState<'expenses' | 'pricing'>('expenses');

  // Expenses State
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('SEALED_PRODUCT');
  const [description, setDescription] = useState('');
  const [documentUrl, setDocumentUrl] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: expenses, execute: reloadExpenses } = useAsync(async () => {
    const { data } = await apiClient.get('/expenses');
    return data.expenses;
  });

  // Pricing State
  const [syncing, setSyncing] = useState(false);
  const [selectedTcg, setSelectedTcg] = useState('ALL');
  const [syncScope, setSyncScope] = useState<'all' | 'tcg' | 'edition'>('all');
  const [selectedEditionId, setSelectedEditionId] = useState('');
  const [editions, setEditions] = useState<EditionWithCounts[]>([]);
  const [volatileData, setVolatileData] = useState<any>(null);

  useEffect(() => {
    if (activeHubTab === 'pricing') {
      getEditions({ tcgId: selectedTcg === 'ALL' ? undefined : selectedTcg, activeOnly: true })
        .then(setEditions);
      getPriceVolatility(10, '7d').then(setVolatileData);
    }
  }, [activeHubTab, selectedTcg]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const { data } = await apiClient.post('/media/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setDocumentUrl(data.url);
    } catch (err) {
      alert('Error al subir archivo');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await apiClient.post('/expenses', { amount: Number(amount), category, description, documentUrl });
      setAmount(''); setDescription(''); setDocumentUrl('');
      reloadExpenses();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const filters: any = {};
      if (syncScope === 'tcg') filters.tcgName = selectedTcg;
      if (syncScope === 'edition') filters.editionId = selectedEditionId;
      await syncListingPrices(undefined, undefined, 'Manual sync', true, filters);
      alert('Sincronización completada');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="finance-hub">
      <div className="tabs" style={{ marginBottom: 30, display: 'flex', gap: 10 }}>
        <button className={`btn ${activeHubTab === 'expenses' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveHubTab('expenses')}>💸 Egresos y Facturas</button>
        <button className={`btn ${activeHubTab === 'pricing' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveHubTab('pricing')}>💰 Margen y Precios</button>
      </div>

      {activeHubTab === 'expenses' ? (
        <div className="tab-content fade-in">
          <div className="grid-cols-2" style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 30 }}>
            <div className="card" style={{ padding: 20 }}>
              <h3>Registrar Egreso</h3>
              <form onSubmit={handleSubmitExpense} style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 15 }}>
                <input type="number" className="input" placeholder="Monto CLP" value={amount} onChange={e => setAmount(e.target.value)} required />
                <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
                  <option value="SEALED_PRODUCT">Producto Sellado</option>
                  <option value="RENT">Gastos Operativos</option>
                  <option value="OTHER">Otros</option>
                </select>
                <textarea className="input" placeholder="Descripción" value={description} onChange={e => setDescription(e.target.value)} />
                <input type="file" className="input" onChange={handleFileUpload} />
                <button className="btn btn-primary" disabled={isSubmitting || uploadingFile}>Guardar Egreso</button>
              </form>
            </div>
            <div className="card" style={{ padding: 20 }}>
              <h3>Historial de Gastos</h3>
              <div className="table-wrapper" style={{ marginTop: 20 }}>
                <table className="data-table">
                  <thead><tr><th>Fecha</th><th>Categoría</th><th>Monto</th><th>Doc</th></tr></thead>
                  <tbody>
                    {(expenses ?? []).map((exp: any) => (
                      <tr key={exp.id}>
                        <td>{new Date(exp.date).toLocaleDateString()}</td>
                        <td><span className="badge badge-gray">{exp.category}</span></td>
                        <td style={{ color: '#ef4444', fontWeight: 700 }}>-{formatClp(exp.amount)}</td>
                        <td>{exp.documentUrl ? <a href={exp.documentUrl} target="_blank" rel="noreferrer">📄</a> : '—'}</td>
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
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="section-title">Sincronización Manual</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 15 }}>
              <select className="input" value={syncScope} onChange={e => setSyncScope(e.target.value as any)}>
                <option value="all">Todo el catálogo</option>
                <option value="tcg">Por TCG</option>
                <option value="edition">Por Edición</option>
              </select>
              {syncScope !== 'all' && (
                <select className="input" value={selectedTcg} onChange={e => setSelectedTcg(e.target.value)}>
                  <option value="MAGIC">Magic</option>
                  <option value="POKEMON">Pokémon</option>
                  <option value="YUGIOH">Yu-Gi-Oh</option>
                </select>
              )}
              {syncScope === 'edition' && (
                <select className="input" value={selectedEditionId} onChange={e => setSelectedEditionId(e.target.value)}>
                  <option value="">Selecciona Edición</option>
                  {editions.map(ed => <option key={ed.id} value={ed.id}>{ed.editionName}</option>)}
                </select>
              )}
              <button className="btn btn-primary" onClick={handleManualSync} disabled={syncing}>
                {syncing ? 'Sincronizando...' : '🔄 Correr Sync'}
              </button>
            </div>
          </div>

          <div className="card">
            <div className="section-title">Alertas de Volatilidad (7d)</div>
            <div className="table-wrapper" style={{ marginTop: 15 }}>
              <table className="data-table">
                <thead><tr><th>Carta</th><th>Cambio</th><th>Precio Antiguo</th><th>Nuevo</th></tr></thead>
                <tbody>
                  {(volatileData?.events || []).slice(0, 10).map((v: any, i: number) => (
                    <tr key={i}>
                      <td>{v.cardName}</td>
                      <td style={{ color: v.percentChange > 0 ? 'var(--success)' : 'var(--danger)' }}>{v.percentChange > 0 ? '+' : ''}{v.percentChange.toFixed(1)}%</td>
                      <td>{formatClp(v.oldPrice)}</td>
                      <td>{formatClp(v.newPrice)}</td>
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

import { useEffect, useState } from 'react';
import localImports, { LocalListing } from '../services/localImports';
import apiClient from '../services/api';
import { DEFAULT_MARGIN_INPUT } from '../constants/pricing';

export default function LocalImportsManager() {
  const [listings, setListings] = useState<LocalListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<Partial<LocalListing>>({});
  const [message, setMessage] = useState<string | null>(null);

  const load = () => setListings(localImports.listLocalListings());

  useEffect(() => {
    load();
  }, []);

  const handleDelete = (id: string) => {
    if (!confirm('Eliminar este listing local? Esta acción no se puede deshacer.')) return;
    localImports.deleteListing(id);
    load();
    setMessage('Listado eliminado.');
    setTimeout(() => setMessage(null), 2500);
  };

  const handleEdit = (l: LocalListing) => {
    setEditingId(l.id);
    setEditState({ quantity: l.quantity, condition: l.condition, referencePrice: l.referencePrice, marginMultiplier: l.marginMultiplier });
  };

  const handleSave = (id: string) => {
    try {
      localImports.updateListing({ id, ...(editState as any) });
      setEditingId(null);
      load();
      setMessage('Listado actualizado.');
      setTimeout(() => setMessage(null), 2500);
    } catch (err: any) {
      setMessage(err?.message ?? 'Error al actualizar');
    }
  };

  const handleExportJson = () => {
    const json = localImports.exportLocalListingsJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'netdecker-local-imports.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const csv = localImports.exportLocalListingsCsv();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'netdecker-local-imports.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJsonFile = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const added = localImports.importLocalListingsFromJson(parsed);
      load();
      setMessage(`Importados ${added} registros.`);
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage('Error al importar JSON');
    }
  };

  const handleClearAll = () => {
    if (!confirm('Borrar todas las importaciones locales?')) return;
    localImports.clearLocalListings();
    load();
    setMessage('Todos los listings locales fueron borrados.');
    setTimeout(() => setMessage(null), 3000);
  };

  const handleSendAllToBackend = async () => {
    if (!confirm('Enviar todos los listings locales al backend? Se eliminarán los que se importen con éxito.')) return;
    setLoading(true);
    const errors: string[] = [];
    for (const l of listings) {
      try {
        await apiClient.post('/external/import/card', {
          tcg: l.tcg,
          cardId: l.card.externalId,
          createListing: true,
          referencePrice: l.referencePrice,
          marginMultiplier: l.marginMultiplier,
          quantity: l.quantity,
          condition: l.condition,
        });
        localImports.deleteListing(l.id);
      } catch (err: any) {
        errors.push(`${l.card.cardName}: ${err?.message ?? 'failed'}`);
      }
    }
    setLoading(false);
    load();
    if (errors.length === 0) setMessage('Todos los listings enviados al backend.');
    else setMessage(`Algunos fallaron: ${errors.slice(0,3).join('; ')}${errors.length>3? '...' : ''}`);
    setTimeout(() => setMessage(null), 4000);
  };

  return (
    <div className="section-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Local Imports Manager</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleExportJson} style={{ padding: '6px 10px' }}>Export JSON</button>
          <button onClick={handleExportCsv} style={{ padding: '6px 10px' }}>Export CSV</button>
          <label style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer' }}>
            Import JSON
            <input type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => handleImportJsonFile(e.target.files ? e.target.files[0] : null)} />
          </label>
          <button onClick={handleSendAllToBackend} disabled={loading || listings.length===0} style={{ padding: '6px 10px' }}>Send All to Backend</button>
          <button onClick={handleClearAll} style={{ padding: '6px 10px', background: '#f44336', color: '#fff' }}>Clear All</button>
        </div>
      </div>

      {message && <div style={{ marginTop: 12, padding: 8, background: '#fff8e1', border: '1px solid #ffe082' }}>{message}</div>}

      <div style={{ marginTop: 16, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #eee' }}>
              <th style={{ padding: 8 }}>ID</th>
              <th style={{ padding: 8 }}>Created</th>
              <th style={{ padding: 8 }}>TCG</th>
              <th style={{ padding: 8 }}>Name</th>
              <th style={{ padding: 8 }}>Edition</th>
              <th style={{ padding: 8 }}>Qty</th>
              <th style={{ padding: 8 }}>Cond</th>
              <th style={{ padding: 8 }}>Ref Price</th>
              <th style={{ padding: 8 }}>Margin</th>
              <th style={{ padding: 8 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {listings.map((l) => (
              <tr key={l.id} style={{ borderBottom: '1px solid #fafafa' }}>
                <td style={{ padding: 8, fontSize: 12 }}>{l.id}</td>
                <td style={{ padding: 8, fontSize: 12 }}>{new Date(l.createdAt).toLocaleString()}</td>
                <td style={{ padding: 8 }}>{l.tcg}</td>
                <td style={{ padding: 8 }}>{l.card.cardName}</td>
                <td style={{ padding: 8 }}>{l.card.editionCode}</td>
                <td style={{ padding: 8 }}>
                  {editingId === l.id ? (
                    <input type="number" value={String(editState.quantity ?? l.quantity)} onChange={(e) => setEditState((s) => ({ ...s, quantity: parseInt(e.target.value || '0', 10) }))} style={{ width: 80 }} />
                  ) : (
                    l.quantity
                  )}
                </td>
                <td style={{ padding: 8 }}>
                  {editingId === l.id ? (
                    <select value={String(editState.condition ?? l.condition)} onChange={(e) => setEditState((s) => ({ ...s, condition: e.target.value }))}>
                      {['NM', 'LP', 'MP', 'HP', 'DMG'].map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : (
                    l.condition
                  )}
                </td>
                <td style={{ padding: 8 }}>
                  {editingId === l.id ? (
                    <input type="number" step="0.01" value={String(editState.referencePrice ?? l.referencePrice ?? '')} onChange={(e) => setEditState((s) => ({ ...s, referencePrice: e.target.value ? parseFloat(e.target.value) : undefined }))} style={{ width: 100 }} />
                  ) : (
                    l.referencePrice ? `$${l.referencePrice.toFixed(2)}` : '—'
                  )}
                </td>
                <td style={{ padding: 8 }}>
                  {editingId === l.id ? (
                    <input type="number" step="0.01" value={String(editState.marginMultiplier ?? l.marginMultiplier ?? DEFAULT_MARGIN_INPUT)} onChange={(e) => setEditState((s) => ({ ...s, marginMultiplier: e.target.value ? parseFloat(e.target.value) : undefined }))} style={{ width: 80 }} />
                  ) : (
                    l.marginMultiplier ?? DEFAULT_MARGIN_INPUT
                  )}
                </td>
                <td style={{ padding: 8 }}>
                  {editingId === l.id ? (
                    <>
                      <button onClick={() => handleSave(l.id)} style={{ marginRight: 6 }}>Save</button>
                      <button onClick={() => { setEditingId(null); setEditState({}); }}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => handleEdit(l)} style={{ marginRight: 6 }}>Edit</button>
                      <button onClick={() => handleDelete(l.id)} style={{ marginRight: 6 }}>Delete</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {listings.length === 0 && (
              <tr>
                <td colSpan={10} style={{ padding: 16, textAlign: 'center' }}>No local imports found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

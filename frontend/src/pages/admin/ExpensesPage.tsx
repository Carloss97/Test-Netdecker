import { useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import apiClient from '../../services/api';

function formatClp(n: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
}

export function ExpensesPage() {
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('SEALED_PRODUCT');
  const [description, setDescription] = useState('');
  const [documentUrl, setDocumentUrl] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: expenses, status, execute: reloadExpenses } = useAsync(async () => {
    const { data } = await apiClient.get('/expenses');
    return data.expenses;
  });

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
      alert('Error al subir archivo. Verifica que sea JPG, PNG o PDF y < 5MB.');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return alert('Ingresa un monto válido');

    setIsSubmitting(true);
    try {
      await apiClient.post('/expenses', {
        amount: Number(amount),
        category,
        description,
        documentUrl,
        date: new Date().toISOString()
      });
      setAmount('');
      setDescription('');
      setDocumentUrl('');
      reloadExpenses();
    } catch (err) {
      alert('Error al guardar egreso');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Seguro que quieres eliminar este egreso?')) return;
    try {
      await apiClient.delete(`/expenses/${id}`);
      reloadExpenses();
    } catch (err) {
      alert('Error al eliminar');
    }
  };

  return (
    <div className="expenses-page">
      <div className="grid-cols-2" style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 30 }}>
        <section>
          <div className="card" style={{ padding: 25 }}>
            <h3 style={{ marginBottom: 20 }}>Registrar Nuevo Egreso</h3>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 5, fontWeight: 600 }}>Monto (CLP)</label>
                <input 
                  type="number" 
                  className="input" 
                  placeholder="Ej: 50000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required 
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 5, fontWeight: 600 }}>Categoría</label>
                <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="SEALED_PRODUCT">Producto Sellado / Apertura</option>
                  <option value="RENT">Arriendo / Gastos Comunes</option>
                  <option value="SHIPPING">Insumos de Envío</option>
                  <option value="MARKETING">Publicidad / Ads</option>
                  <option value="OTHER">Otros Gastos</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 5, fontWeight: 600 }}>Descripción / Nota</label>
                <textarea 
                  className="input" 
                  placeholder="Ej: Compra de 2 cajas OP-05"
                  style={{ minHeight: 80 }}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 5, fontWeight: 600 }}>Adjuntar Comprobante (Imagen o PDF)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input 
                    type="file" 
                    className="input" 
                    accept="image/*,.pdf"
                    onChange={handleFileUpload}
                    disabled={uploadingFile}
                  />
                  {uploadingFile && <span style={{ fontSize: '0.75rem', color: 'var(--primary)' }}>Subiendo archivo...</span>}
                  {documentUrl && <span style={{ fontSize: '0.75rem', color: '#10b981' }}>✅ Archivo listo: {documentUrl.split('/').pop()}</span>}
                </div>
              </div>
              <button type="submit" className="btn btn-primary" disabled={isSubmitting || uploadingFile} style={{ width: '100%', padding: 12 }}>
                {isSubmitting ? 'Guardando...' : 'Guardar Egreso'}
              </button>
            </form>
          </div>
        </section>

        <section>
          <div className="card" style={{ padding: 25 }}>
            <h3 style={{ marginBottom: 20 }}>Historial de Gastos</h3>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Categoría</th>
                    <th>Descripción</th>
                    <th style={{ textAlign: 'right' }}>Monto</th>
                    <th>Doc</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {(expenses ?? []).map((exp: any) => (
                    <tr key={exp.id}>
                      <td style={{ fontSize: '0.85rem' }}>{new Date(exp.date).toLocaleDateString()}</td>
                      <td>
                        <span className="badge badge-gray" style={{ fontSize: '0.7rem' }}>{exp.category}</span>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>{exp.description || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#ef4444' }}>
                        -{formatClp(exp.amount)}
                      </td>
                      <td>
                        {exp.documentUrl ? (
                          <a href={exp.documentUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }} title="Ver comprobante">
                            📄
                          </a>
                        ) : '—'}
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(exp.id)} style={{ color: '#ef4444' }}>
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(!expenses || expenses.length === 0) && status === 'success' && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No has registrado gastos aún.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

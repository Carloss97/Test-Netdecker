import { useEffect, useState } from 'react';
import { getThresholds, createThreshold, updateThreshold, deleteThreshold, ThresholdInput } from '../../services/adminThresholds';
import { useAsync } from '../../hooks/useAsync';
import { Link } from 'react-router-dom';

const SUPPORTED_TCGS = ['MAGIC', 'POKEMON', 'YUGIOH', 'ONE_PIECE', 'DIGIMON', 'WEISS_SCHWARZ'];

export default function ThresholdsPage() {
  const [thresholds, setThresholds] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tcg, setTcg] = useState<string>('');
  const [editionId, setEditionId] = useState<string>('');
  const [thresholdPercent, setThresholdPercent] = useState<string>('10');

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const res: any = await getThresholds();
      setThresholds(res.thresholds ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const handleCreate = async () => {
    const p: ThresholdInput = { tcg: tcg || null, editionId: editionId || null, thresholdPercent: Number(thresholdPercent) };
    await createThreshold(p);
    setTcg(''); setEditionId(''); setThresholdPercent('10');
    await reload();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar umbral?')) return;
    await deleteThreshold(id);
    await reload();
  };

  const handleEdit = async (id: string) => {
    const val = prompt('Nuevo porcentaje (ej: 12.5)');
    if (!val) return;
    const num = Number(val);
    if (!Number.isFinite(num) || num <= 0) return alert('Valor inválido');
    await updateThreshold(id, { thresholdPercent: num });
    await reload();
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Umbrales de Volatilidad</h3>
        <div><Link to="/admin">← Volver al panel</Link></div>
      </div>

      <div style={{ marginTop: 12, marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 6 }}>TCG</label>
        <select value={tcg} onChange={(e) => setTcg(e.target.value)} style={{ padding: 8, marginRight: 8 }}>
          <option value="">(Global / por defecto)</option>
          {SUPPORTED_TCGS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <label style={{ marginLeft: 8 }}>EditionId (opcional)</label>
        <input value={editionId} onChange={(e) => setEditionId(e.target.value)} placeholder="editionId" style={{ marginLeft: 8, padding: 8 }} />
        <label style={{ marginLeft: 8 }}>Threshold %</label>
        <input value={thresholdPercent} onChange={(e) => setThresholdPercent(e.target.value)} style={{ marginLeft: 8, padding: 8, width: 100 }} />
        <button onClick={handleCreate} style={{ marginLeft: 12, padding: '8px 12px' }}>Agregar</button>
      </div>

      {loading && <p>Cargando...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #eee' }}>
            <th>ID</th>
            <th>TCG</th>
            <th>EditionId</th>
            <th>Threshold %</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {thresholds.map((t: any) => (
            <tr key={t.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
              <td style={{ padding: 8 }}>{t.id}</td>
              <td style={{ padding: 8 }}>{t.tcg ?? '-'}</td>
              <td style={{ padding: 8 }}>{t.editionId ?? '-'}</td>
              <td style={{ padding: 8 }}>{t.thresholdPercent}</td>
              <td style={{ padding: 8 }}>
                <button onClick={() => handleEdit(t.id)} style={{ marginRight: 8 }}>Editar</button>
                <button onClick={() => handleDelete(t.id)} style={{ color: '#d32f2f' }}>Eliminar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

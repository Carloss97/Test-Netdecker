import { useEffect, useState } from 'react';
import { listPendingApprovals, approveApproval, rejectApproval } from '../../services/adminApprovals';
import { Link } from 'react-router-dom';

export default function ApprovalsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res: any = await listPendingApprovals(100);
      setItems(res.approvals ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (id: string) => {
    if (!confirm('Aprobar cambio de precio?')) return;
    await approveApproval(id);
    await load();
  };

  const handleReject = async (id: string) => {
    const reason = prompt('Motivo de rechazo (opcional)');
    await rejectApproval(id, reason ?? undefined);
    await load();
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Aprobaciones Pendientes</h3>
        <div><Link to="/admin">← Volver al panel</Link></div>
      </div>

      {loading && <p>Cargando…</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #eee' }}>
            <th>ID</th>
            <th>Card</th>
            <th>Edition</th>
            <th>Old</th>
            <th>New</th>
            <th>Requested At</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
              <td style={{ padding: 8 }}>{it.id}</td>
              <td style={{ padding: 8 }}>{it.cardName}</td>
              <td style={{ padding: 8 }}>{it.editionCode}</td>
              <td style={{ padding: 8 }}>{it.oldPrice}</td>
              <td style={{ padding: 8 }}>{it.newPrice}</td>
              <td style={{ padding: 8 }}>{it.createdAt}</td>
              <td style={{ padding: 8 }}>
                <button onClick={() => handleApprove(it.id)} style={{ marginRight: 8 }}>Aprobar</button>
                <button onClick={() => handleReject(it.id)} style={{ color: '#d32f2f' }}>Rechazar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useAsync } from '../../hooks/useAsync';
import apiClient from '../../services/api';
import ModeToggle from '../../components/ModeToggle';

export function TcgSettingsPage() {
  const [activeTab, setActiveTcg] = useState<string | null>(null);

  const { data: tcgs, execute: reloadTcgs } = useAsync(async () => {
    const { data } = await apiClient.get('/tcgs?includeInactive=true');
    return data;
  }, []);

  const { data: editions, execute: reloadEditions } = useAsync(async () => {
    if (!activeTab) return [];
    const { data } = await apiClient.get(`/editions?tcgId=${activeTab}&activeOnly=false`);
    return data;
  }, [activeTab]);

  useEffect(() => {
    if (tcgs?.length && !activeTab) {
      setActiveTcg(tcgs[0].id);
    }
  }, [tcgs]);

  const toggleTcgStatus = async (tcgId: string, currentStatus: boolean) => {
    try {
      await apiClient.patch(`/tcgs/${tcgId}/status`, { isActive: !currentStatus });
      reloadTcgs();
    } catch (err) {
      alert('Error al actualizar TCG');
    }
  };

  const toggleEditionStatus = async (editionId: string, currentStatus: boolean) => {
    try {
      await apiClient.patch(`/editions/${editionId}/status`, { isActive: !currentStatus });
      reloadEditions();
    } catch (err) {
      alert('Error al actualizar edición');
    }
  };

  return (
    <div className="tcg-settings">
      <div className="grid-cols-2" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 30 }}>
        {/* TCG List */}
        <section className="card" style={{ padding: 20 }}>
          <h3 style={{ marginBottom: 20 }}>Juegos (TCGs)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(tcgs ?? []).map((tcg: any) => (
              <div 
                key={tcg.id} 
                onClick={() => setActiveTcg(tcg.id)}
                style={{ 
                  padding: '12px 15px', 
                  borderRadius: 10, 
                  background: activeTab === tcg.id ? 'var(--primary-light)' : 'var(--bg-card)',
                  border: activeTab === tcg.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span style={{ fontWeight: 600 }}>{tcg.displayName}</span>
                <div onClick={(e) => e.stopPropagation()}>
                  <ModeToggle 
                    checked={tcg.isActive} 
                    onToggle={() => toggleTcgStatus(tcg.id, tcg.isActive)}
                    onLabel="ON"
                    offLabel="OFF"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Editions List */}
        <section className="card" style={{ padding: 25 }}>
          <h3 style={{ marginBottom: 20 }}>Ediciones / Sets</h3>
          {!activeTab ? (
            <div className="empty-state">Selecciona un juego para gestionar sus ediciones.</div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nombre de la Edición</th>
                    <th style={{ textAlign: 'center' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {(editions ?? []).map((ed: any) => (
                    <tr key={ed.id}>
                      <td><code style={{ fontWeight: 700 }}>{ed.editionCode}</code></td>
                      <td style={{ fontWeight: 500 }}>{ed.editionName}</td>
                      <td style={{ display: 'flex', justifyContent: 'center' }}>
                        <ModeToggle 
                          checked={ed.isActive} 
                          onToggle={() => toggleEditionStatus(ed.id, ed.isActive)}
                          onLabel="VENDER"
                          offLabel="OCULTO"
                        />
                      </td>
                    </tr>
                  ))}
                  {editions?.length === 0 && (
                    <tr><td colSpan={3} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No hay ediciones registradas para este TCG.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

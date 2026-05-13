import { useEffect, useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import { useSearchParams } from 'react-router-dom';
import apiClient from '../services/api';
import ModeToggle from '../components/ModeToggle';
import { getTenantVisibilityDiagnostics, resetCatalog } from '../services/catalog';
import { DEFAULT_MARGIN_INPUT } from '../constants/pricing';

type AdminMe = {
  id: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'STAFF';
  storeId?: string | null;
  resolvedStoreId?: string | null;
  scopeMode?: 'session-store-scoped' | 'request-store-scoped' | 'global-admin' | 'unscoped' | string;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h3 style={{ borderBottom: '1px solid #e0e0e0', paddingBottom: 8, marginBottom: 16 }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

export function AdminDashboardPage() {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'system' | 'tcgs'>('system');
  
  useEffect(() => {
    if (searchParams.get('tab') === 'tcgs') setActiveTab('tcgs');
    else setActiveTab('system');
  }, [searchParams]);

  const tenantVisibilityQuery = useAsync(() => getTenantVisibilityDiagnostics(5));
  const adminMeQuery = useAsync(async () => {
    const { data } = await apiClient.get('/admin/auth/me');
    return (data?.data ?? null) as AdminMe | null;
  });
  
  const canManageAdminActions = adminMeQuery.data?.role === 'ADMIN' && !adminMeQuery.data?.storeId;

  // TCG Settings State
  const [selectedTcgId, setSelectedTcgId] = useState<string | null>(null);
  const { data: tcgList, execute: reloadTcgs } = useAsync(() => apiClient.get('/tcgs?includeInactive=true').then(r => r.data), true);
  const { data: editionList, execute: reloadEditions } = useAsync(async () => {
    if (!selectedTcgId) return [];
    const { data } = await apiClient.get(`/editions?tcgId=${selectedTcgId}&activeOnly=false`);
    return data;
  }, false);

  useEffect(() => {
    if (selectedTcgId) void reloadEditions();
  }, [selectedTcgId]);

  useEffect(() => {
    if (tcgList?.length && !selectedTcgId) setSelectedTcgId(tcgList[0].id);
  }, [tcgList]);

  // System State
  const [configMargin, setConfigMargin] = useState(DEFAULT_MARGIN_INPUT);
  const [exchangeRateMode, setExchangeRateMode] = useState<'api' | 'manual'>('api');
  const [manualUsdToClp, setManualUsdToClp] = useState('950');
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const toggleTcgStatus = async (id: string, current: boolean) => {
    await apiClient.patch(`/tcgs/${id}/status`, { isActive: !current });
    reloadTcgs();
  };

  const toggleEditionStatus = async (id: string, current: boolean) => {
    await apiClient.patch(`/editions/${id}/status`, { isActive: !current });
    reloadEditions();
  };

  return (
    <div className="admin-hub" style={{ padding: 20 }}>
      <div className="tabs" style={{ marginBottom: 30, display: 'flex', gap: 10 }}>
        <button className={`btn ${activeTab === 'system' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('system')}>🛠️ Configuración de Sistema</button>
        <button className={`btn ${activeTab === 'tcgs' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('tcgs')}>⚙️ Ajustes de TCG y Ediciones</button>
      </div>

      {activeTab === 'system' ? (
        <div className="tab-content fade-in">
          <Section title="🧭 Diagnóstico de Visibilidad">
            <div className="surface-card" style={{ padding: 16 }}>
               <button className="btn btn-sm" onClick={() => tenantVisibilityQuery.execute()}>🔎 Recalcular diagnóstico</button>
               {tenantVisibilityQuery.data?.diagnostics && (
                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 15, marginTop: 15 }}>
                    <div className="card" style={{ textAlign: 'center' }}>
                      <small>Inventario</small>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{tenantVisibilityQuery.data.diagnostics.counts.inventoryListings}</div>
                    </div>
                    <div className="card" style={{ textAlign: 'center' }}>
                      <small>Con Stock</small>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{tenantVisibilityQuery.data.diagnostics.counts.inventoryInStockListings}</div>
                    </div>
                    <div className="card" style={{ textAlign: 'center' }}>
                      <small>Storefront</small>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{tenantVisibilityQuery.data.diagnostics.counts.storefrontListings}</div>
                    </div>
                    <div className="card" style={{ textAlign: 'center' }}>
                      <small>Ocultos</small>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{tenantVisibilityQuery.data.diagnostics.counts.hiddenByStatusListings ?? 0}</div>
                    </div>
                 </div>
               )}
            </div>
          </Section>

          <Section title="💱 Parámetros de Precio Global">
            <div className="surface-card" style={{ padding: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
                <div><label>Margen Defecto</label><input className="input" value={configMargin} onChange={e => setConfigMargin(e.target.value)} /></div>
                <div><label>Modo Dólar</label><select className="input" value={exchangeRateMode} onChange={e => setExchangeRateMode(e.target.value as any)}><option value="api">API</option><option value="manual">Manual</option></select></div>
                <div><label>USD/CLP</label><input className="input" value={manualUsdToClp} onChange={e => setManualUsdToClp(e.target.value)} disabled={exchangeRateMode === 'api'} /></div>
              </div>
              <button className="btn btn-primary" style={{ marginTop: 15 }}>Guardar Parámetros</button>
            </div>
          </Section>

          {canManageAdminActions && (
            <Section title="⚠️ Zona de Peligro">
              <button className="btn btn-danger" onClick={() => setShowResetConfirm(true)}>🗑️ Resetear Base de Datos</button>
            </Section>
          )}
        </div>
      ) : (
        <div className="tab-content fade-in">
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 30 }}>
            <div className="card">
              <h3>Juegos Activos</h3>
              <div style={{ marginTop: 15, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Array.isArray(tcgList) && tcgList.map((tcg: any) => (
                  <div key={tcg.id} onClick={() => setSelectedTcgId(tcg.id)} style={{ padding: 12, borderRadius: 8, background: selectedTcgId === tcg.id ? 'var(--primary-light)' : 'var(--bg-card)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600 }}>{tcg.displayName}</span>
                    <div onClick={e => e.stopPropagation()}>
                      <ModeToggle checked={tcg.isActive} onToggle={() => toggleTcgStatus(tcg.id, tcg.isActive)} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <h3>Ediciones de {tcgList?.find((t:any) => t.id === selectedTcgId)?.displayName}</h3>
              <div className="table-wrapper" style={{ marginTop: 15 }}>
                <table className="data-table">
                  <thead><tr><th>Código</th><th>Nombre</th><th>Estado</th></tr></thead>
                  <tbody>
                    {Array.isArray(editionList) && editionList.map((ed: any) => (
                      <tr key={ed.id}>
                        <td><code>{ed.editionCode}</code></td>
                        <td>{ed.editionName}</td>
                        <td><ModeToggle checked={ed.isActive} onToggle={() => toggleEditionStatus(ed.id, ed.isActive)} onLabel="ON" offLabel="OFF" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {showResetConfirm && (
        <div className="modal-overlay">
          <div className="card" style={{ maxWidth: 400 }}>
            <h3 style={{ color: 'var(--danger)' }}>Confirmar Reset</h3>
            <p>Se borrarán todos los sets y cartas. Esta acción es irreversible.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => setShowResetConfirm(false)}>Cancelar</button>
              <button className="btn btn-danger" onClick={async () => { await resetCatalog(); window.location.reload(); }}>Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

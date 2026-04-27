import { useState, useEffect } from 'react';
import { useAsync } from '../../hooks/useAsync';
import apiClient from '../../services/api';

type StoreSettings = {
  defaultMargin?: number;
  [key: string]: any;
};

type Store = {
  id: string;
  slug: string;
  name: string;
  currency: string | null;
  taxRate: number | null;
  settings: string | StoreSettings | null;
};

export function MultiTenantConsole() {
  const [editingId, setUpdatingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, any>>({});

  const { data: stores, execute: reload } = useAsync<Store[]>(async () => {
    const { data } = await apiClient.get('/admin/stores');
    return data.stores;
  });

  const handleUpdate = async (id: string) => {
    const values = editValues[id];
    if (!values) return;

    try {
      setUpdatingId(id);
      await apiClient.patch(`/admin/stores/${id}`, {
        name: values.name,
        currency: values.currency,
        taxRate: Number(values.taxRate),
        settings: values.settings,
      });
      alert('Tienda actualizada con éxito');
      void reload();
    } catch (err) {
      alert('Error al actualizar tienda');
    } finally {
      setUpdatingId(null);
    }
  };

  const onValueChange = (id: string, field: string, value: any) => {
    setEditValues(prev => ({
      ...prev,
      [id]: {
        ...(prev[id] || (stores?.find(s => s.id === id) || {})),
        [field]: value
      }
    }));
  };

  const getSettingsValue = (store: Store) => {
    if (typeof store.settings === 'string') {
      try { return JSON.parse(store.settings); } catch { return {}; }
    }
    return store.settings || {};
  };

  return (
    <div className="multitenant-console">
      <div className="card">
        <h3>Consola Multi-tienda</h3>
        <p className="sf-muted" style={{ marginBottom: 20 }}>
          Gestión centralizada de márgenes y parámetros para todas las sucursales y tiendas virtuales.
        </p>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nombre / Slug</th>
                <th>Moneda</th>
                <th>Impuesto (%)</th>
                <th>Margen Base</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(stores ?? []).map(store => {
                const currentEdit = editValues[store.id] || {};
                const settings = getSettingsValue(store);
                
                return (
                  <tr key={store.id}>
                    <td>
                      <input 
                        className="input input-sm" 
                        value={currentEdit.name ?? store.name} 
                        onChange={(e) => onValueChange(store.id, 'name', e.target.value)}
                      />
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                        slug: <code>{store.slug}</code>
                      </div>
                    </td>
                    <td>
                      <select 
                        className="input input-sm"
                        value={currentEdit.currency ?? store.currency ?? 'CLP'}
                        onChange={(e) => onValueChange(store.id, 'currency', e.target.value)}
                      >
                        <option value="CLP">CLP (Chile)</option>
                        <option value="USD">USD (EE.UU.)</option>
                      </select>
                    </td>
                    <td>
                      <input 
                        type="number"
                        className="input input-sm" 
                        style={{ width: 80 }}
                        value={currentEdit.taxRate ?? store.taxRate ?? 0}
                        onChange={(e) => onValueChange(store.id, 'taxRate', e.target.value)}
                      />
                    </td>
                    <td>
                      <input 
                        type="number"
                        step="0.05"
                        className="input input-sm" 
                        style={{ width: 100 }}
                        value={currentEdit.settings?.defaultMargin ?? settings.defaultMargin ?? 1.2}
                        onChange={(e) => {
                          const newSettings = { ...settings, defaultMargin: Number(e.target.value) };
                          onValueChange(store.id, 'settings', newSettings);
                        }}
                      />
                    </td>
                    <td>
                      <button 
                        className="btn btn-primary btn-sm" 
                        onClick={() => handleUpdate(store.id)}
                        disabled={editingId === store.id}
                      >
                        {editingId === store.id ? 'Guardando...' : 'Guardar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

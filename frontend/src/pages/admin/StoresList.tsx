import React, { useEffect, useState } from 'react';
import type { Store } from '../../types';
import { getStores } from '../../services/stores';
import StoreForm from '../../components/StoreForm';

const StoresList: React.FC = () => {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Store | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    setLoading(true);
    getStores()
      .then((data) => setStores(data))
      .catch(() => {
        setStores([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const onSaved = (_store: Store) => {
    setShowForm(false);
    setEditing(null);
    getStores().then((data) => setStores(data));
  };

  return (
    <div>
      <h1>Stores</h1>
      <div style={{ marginBottom: 12 }}>
        <button onClick={() => { setEditing(null); setShowForm(true); }}>New Store</button>
      </div>

      {showForm && (
        <StoreForm
          initialData={editing}
          onSaved={onSaved}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {loading ? (
        <p>Loading...</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Slug</th>
              <th style={{ textAlign: 'left' }}>Name</th>
              <th style={{ textAlign: 'left' }}>Currency</th>
              <th style={{ textAlign: 'left' }}>Tax Rate</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => (
              <tr key={s.id}>
                <td>{s.slug}</td>
                <td>{s.name}</td>
                <td>{s.currency ?? '-'}</td>
                <td>{s.taxRate ?? '-'}</td>
                <td>
                  <button onClick={() => { setEditing(s); setShowForm(true); }}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default StoresList;

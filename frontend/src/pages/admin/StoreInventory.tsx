import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getStore, getStoreInventory, updateStoreInventory } from '../../services/stores';

export default function StoreInventory() {
  const { id } = useParams();
  const storeId = id || null;
  const [store, setStore] = useState<any | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!storeId) return;
    setLoading(true);
    getStore(storeId).then((s) => setStore(s)).catch(() => setStore(null));
    getStoreInventory(storeId).then((r) => setRows(r.results || [])).catch(() => setRows([])).finally(() => setLoading(false));
  }, [storeId]);

  const save = async (listingId: string) => {
    if (!storeId) return;
    const raw = editing[listingId];
    const q = Number.parseInt(raw ?? '', 10);
    if (!Number.isFinite(q) || q < 0) return;
    try {
      const resp = await updateStoreInventory(storeId, listingId, q);
      if (resp && resp.success) {
        setRows((prev) => prev.map((r) => (r.listingId === listingId ? { ...r, storeQuantity: resp.storeQuantity, quantity: resp.quantity } : r)));
        setEditing((prev) => { const n = { ...prev }; delete n[listingId]; return n; });
      }
    } catch (_) {}
  };

  if (!storeId) return <div>storeId missing</div>;

  return (
    <div>
      <h2>Inventory — {store ? store.name || store.code : storeId}</h2>
      {loading ? <p>Loading…</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>Card</th>
              <th>Listing</th>
              <th>Store Qty</th>
              <th>Aggregate Qty</th>
              <th/></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.stockId || r.listingId}>
                <td>{(r.cardName || r.externalId) ?? r.cardId}</td>
                <td>{r.listingId}</td>
                <td>
                  <input value={editing[r.listingId] ?? String(r.storeQuantity ?? 0)} onChange={(e) => setEditing((p) => ({ ...p, [r.listingId]: e.target.value }))} style={{ width: 80 }} />
                </td>
                <td>{r.quantity ?? 0}</td>
                <td><button onClick={() => save(r.listingId)}>Save</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getTCGs,
  getEditions,
  getEditionCardsWithStock,
  batchUpdateStock,
  downloadEditionCsvTemplate,
  importInventoryCsv,
} from '../services/catalog';
import type { TCG, EditionWithCounts, CardWithStock } from '../types';
const TCG_META: Record<string, { emoji: string; label: string }> = {
  MAGIC: { emoji: '🧙', label: 'Magic: The Gathering' },
  POKEMON: { emoji: '🎮', label: 'Pokémon' },
  YUGIOH: { emoji: '⚔️', label: 'Yu-Gi-Oh!' },
  ONE_PIECE: { emoji: '☠️', label: 'One Piece' },
};

const RARITY_BADGE: Record<string, string> = {
  common: 'badge-gray',
  uncommon: 'badge-blue',
  rare: 'badge-purple',
  mythic: 'badge-orange',
  legendary: 'badge-orange',
  'ultra rare': 'badge-orange',
  'secret rare': 'badge-yellow',
  'super rare': 'badge-purple',
  holo: 'badge-blue',
};

function getRarityBadge(rarity?: string): string {
  if (!rarity) return 'badge-gray';
  return RARITY_BADGE[rarity.toLowerCase()] ?? 'badge-gray';
}

export function InventoryPage() {
  const [tcgs, setTcgs] = useState<TCG[]>([]);
  const [selectedTcg, setSelectedTcg] = useState<string | null>(null);
  const [editions, setEditions] = useState<EditionWithCounts[]>([]);
  const [selectedEdition, setSelectedEdition] = useState<string | null>(null);
  const [cards, setCards] = useState<CardWithStock[]>([]);
  const [setSearch, setSetSearch] = useState('');

  const [loadingTcgs, setLoadingTcgs] = useState(false);
  const [loadingEditions, setLoadingEditions] = useState(false);
  const [loadingCards, setLoadingCards] = useState(false);
  const [saving, setSaving] = useState(false);

  const [dirtyRows, setDirtyRows] = useState<Map<string, number>>(new Map());
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Card image preview modal
  const [previewCard, setPreviewCard] = useState<{ name: string; imageUrl?: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoadingTcgs(true);
    getTCGs()
      .then((data: TCG[]) => setTcgs(data))
      .catch(() => setError('Error al cargar TCGs'))
      .finally(() => setLoadingTcgs(false));
  }, []);

  useEffect(() => {
    if (!selectedTcg) return;
    setLoadingEditions(true);
    setEditions([]);
    setSelectedEdition(null);
    setCards([]);
    setDirtyRows(new Map());
    getEditions({ tcgId: selectedTcg })
      .then(setEditions)
      .catch(() => setError('Error al cargar ediciones'))
      .finally(() => setLoadingEditions(false));
  }, [selectedTcg]);

  useEffect(() => {
    if (!selectedEdition) return;
    setLoadingCards(true);
    setCards([]);
    setDirtyRows(new Map());
    getEditionCardsWithStock(selectedEdition)
      .then((inv) => setCards(inv.cards))
      .catch(() => setError('Error al cargar cartas'))
      .finally(() => setLoadingCards(false));
  }, [selectedEdition]);

  const filteredEditions = editions.filter((e) =>
    e.editionName.toLowerCase().includes(setSearch.toLowerCase()) ||
    e.editionCode.toLowerCase().includes(setSearch.toLowerCase())
  );

  const startEdit = useCallback((listingId: string, currentQty: number) => {
    setEditingCell(listingId);
    setEditValue(String(currentQty));
  }, []);

  const commitEdit = useCallback((listingId: string, value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 0) {
      setDirtyRows((prev) => {
        const next = new Map(prev);
        next.set(listingId, num);
        return next;
      });
    }
    setEditingCell(null);
    setEditValue('');
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue('');
  }, []);

  const handleSaveChanges = async () => {
    if (dirtyRows.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      const updates = Array.from(dirtyRows.entries()).map(([listingId, quantity]) => ({
        listingId,
        quantity,
      }));
      await batchUpdateStock(updates);
      setCards((prev) =>
        prev.map((card) => ({
          ...card,
          listings: card.listings.map((l) =>
            dirtyRows.has(l.id) ? { ...l, quantity: dirtyRows.get(l.id)! } : l
          ),
        }))
      );
      setDirtyRows(new Map());
      setSuccessMsg(`${updates.length} cambio(s) guardados correctamente`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch {
      setError('Error al guardar cambios de stock');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadTemplate = async () => {
    if (!selectedEdition) return;
    try {
      const blob = await downloadEditionCsvTemplate(selectedEdition);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `template-${selectedEdition}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Error al descargar template CSV');
    }
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importInventoryCsv(file);
      setSuccessMsg('CSV importado correctamente. Recargando…');
      if (selectedEdition) {
        setLoadingCards(true);
        getEditionCardsWithStock(selectedEdition)
          .then((inv) => setCards(inv.cards))
          .catch(() => setError('Error al recargar cartas'))
          .finally(() => setLoadingCards(false));
      }
    } catch {
      setError('Error al importar CSV');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getDisplayQty = (listing: CardWithStock['listings'][number]) => {
    return dirtyRows.has(listing.id) ? dirtyRows.get(listing.id)! : listing.quantity;
  };

  const fmtCLP = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  const selectedEditionObj = editions.find((e) => e.id === selectedEdition);

  const fallbackTcgs: TCG[] = Object.keys(TCG_META).map((k) => ({
    id: k,
    name: k,
    displayName: TCG_META[k].label,
  }));

  const displayTcgs = tcgs.length > 0 ? tcgs : fallbackTcgs;

  return (
    <div>
      {/* Card image preview modal */}
      {previewCard && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setPreviewCard(null)}
        >
          <div
            style={{
              background: 'var(--surface)', borderRadius: 12, padding: 20,
              maxWidth: 360, width: '90%', textAlign: 'center',
              boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 600, marginBottom: 12, fontSize: '1rem' }}>
              {previewCard.name}
            </div>
            {previewCard.imageUrl ? (
              <img
                src={previewCard.imageUrl}
                alt={previewCard.name}
                style={{ maxWidth: '100%', borderRadius: 8, maxHeight: 400, objectFit: 'contain' }}
              />
            ) : (
              <div style={{ color: 'var(--text-muted)', padding: '40px 0', fontSize: '0.875rem' }}>
                Sin imagen disponible
              </div>
            )}
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginTop: 16 }}
              onClick={() => setPreviewCard(null)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="error-message" style={{ marginBottom: 16 }}>
          ⚠️ {error}
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: 8 }}
            onClick={() => setError(null)}
          >
            ✕
          </button>
        </div>
      )}
      {successMsg && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 16, color: '#15803d', fontSize: '0.875rem' }}>
          ✓ {successMsg}
        </div>
      )}

      <div className="inventory-layout">
        {/* Column 1: TCG Selector */}
        <div className="inventory-col-tcg">
          <div className="section-title">Juego</div>
          {loadingTcgs ? (
            <div className="loading-spinner" style={{ padding: 20 }}>⏳</div>
          ) : (
            displayTcgs.map((tcg) => {
              const meta = TCG_META[tcg.name] ?? { emoji: '🃏', label: tcg.displayName };
              return (
                <div
                  key={tcg.id}
                  className={`tcg-selector-card${selectedTcg === tcg.id ? ' active' : ''}`}
                  onClick={() => setSelectedTcg(tcg.id)}
                >
                  <span className="tcg-selector-emoji">{meta.emoji}</span>
                  <div>
                    <div className="tcg-selector-name">{meta.label}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{tcg.name}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Column 2: Set list */}
        <div className="inventory-col-sets">
          <div className="section-title">Set / Edición</div>
          {selectedTcg ? (
            <>
              <input
                type="text"
                className="input input-sm"
                placeholder="Buscar set…"
                value={setSearch}
                onChange={(e) => setSetSearch(e.target.value)}
                style={{ marginBottom: 8 }}
              />
              {loadingEditions ? (
                <div className="loading-spinner" style={{ padding: 20 }}>⏳</div>
              ) : filteredEditions.length === 0 ? (
                <div className="empty-state" style={{ padding: 20 }}>
                  <div>Sin sets disponibles</div>
                </div>
              ) : (
                filteredEditions.map((ed) => (
                  <div
                    key={ed.id}
                    className={`set-item${selectedEdition === ed.id ? ' active' : ''}`}
                    onClick={() => setSelectedEdition(ed.id)}
                  >
                    <div className="set-item-name">{ed.editionName}</div>
                    <div className="set-item-meta">
                      {ed.editionCode} · {ed.cardCount ?? 0} cartas · {ed.listingCount ?? 0} listings
                    </div>
                  </div>
                ))
              )}
            </>
          ) : (
            <div className="empty-state" style={{ padding: 20 }}>
              <div>Selecciona un juego</div>
            </div>
          )}
        </div>

        {/* Column 3: Cards table */}
        <div className="inventory-col-cards">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              {selectedEditionObj ? (
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                  {selectedEditionObj.editionName}
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8, fontSize: '0.8rem' }}>
                    {cards.length} cartas
                  </span>
                </span>
              ) : (
                <span style={{ color: 'var(--text-muted)' }}>Selecciona un set</span>
              )}
            </div>
            {selectedEdition && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={handleDownloadTemplate}>
                  ⬇ Template CSV
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()}>
                  ⬆ Subir CSV
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  style={{ display: 'none' }}
                  onChange={handleCsvUpload}
                />
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleSaveChanges}
                  disabled={dirtyRows.size === 0 || saving}
                >
                  {saving ? '⏳ Guardando…' : `💾 Guardar${dirtyRows.size > 0 ? ` (${dirtyRows.size})` : ''}`}
                </button>
              </div>
            )}
          </div>

          <div className="table-wrapper">
            {!selectedEdition ? (
              <div className="empty-state">
                <div className="empty-state-icon">📦</div>
                <h3>Selecciona un set</h3>
                <p>Elige un juego y una edición para ver las cartas</p>
              </div>
            ) : loadingCards ? (
              <div className="loading-spinner">⏳ Cargando cartas…</div>
            ) : cards.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🔍</div>
                <h3>Sin cartas</h3>
                <p>Este set no tiene cartas en el catálogo aún</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>Nombre</th>
                    <th>Rareza</th>
                    <th>Cond.</th>
                    <th style={{ width: 80 }}>Stock</th>
                    <th>Precio USD</th>
                    <th>Precio CLP</th>
                  </tr>
                </thead>
                <tbody>
                  {cards.map((card, idx) => {
                    const mainListing = card.listings[0];
                    const isDirty = mainListing ? dirtyRows.has(mainListing.id) : false;
                    return (
                      <tr key={card.id} className={isDirty ? 'row-dirty' : ''}>
                        <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          {card.cardNumber ?? idx + 1}
                        </td>
                        <td>
                          <div
                            style={{ fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                            onClick={() => setPreviewCard({ name: card.cardName, imageUrl: card.imageUrl })}
                            title="Ver imagen de la carta"
                          >
                            {card.cardName}
                            {card.imageUrl && (
                              <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>🖼</span>
                            )}
                          </div>
                          {card.cardCode && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{card.cardCode}</div>
                          )}
                        </td>
                        <td>
                          {card.rarity ? (
                            <span className={`badge ${getRarityBadge(card.rarity)}`}>
                              {card.rarity}
                            </span>
                          ) : '—'}
                        </td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {mainListing?.condition ?? '—'}
                        </td>
                        <td>
                          {mainListing ? (
                            editingCell === mainListing.id ? (
                              <input
                                type="number"
                                className="qty-input"
                                value={editValue}
                                autoFocus
                                min={0}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => commitEdit(mainListing.id, editValue)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitEdit(mainListing.id, editValue);
                                  if (e.key === 'Escape') cancelEdit();
                                }}
                              />
                            ) : (
                              <span
                                className="qty-display"
                                onClick={() => startEdit(mainListing.id, getDisplayQty(mainListing))}
                                title="Clic para editar"
                              >
                                {getDisplayQty(mainListing)}
                                <span style={{ fontSize: '0.6rem', opacity: 0.5 }}>✏</span>
                              </span>
                            )
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.8rem' }}>
                          {mainListing?.referencePrice
                            ? `$${mainListing.referencePrice.toFixed(2)}`
                            : '—'}
                        </td>
                        <td style={{ fontSize: '0.8rem', fontWeight: 500 }}>
                          {mainListing?.finalPrice
                            ? fmtCLP(mainListing.finalPrice)
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

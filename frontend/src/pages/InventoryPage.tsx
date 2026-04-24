import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getTCGs,
  getEditions,
  getEditionCardsWithStock,
  batchUpdateStock,
  downloadEditionCsvTemplate,
  importInventoryCsv,
  updateListingPricingMode,
} from '../services/catalog';
import type { TCG, EditionWithCounts, CardWithStock } from '../types';
import { parsePositiveNumberInput } from '../constants/pricing';
import { logClientError } from '../utils/observability';
const TCG_META: Record<string, { emoji: string; label: string }> = {
  MAGIC: { emoji: '🧙', label: 'Magic: The Gathering' },
  POKEMON: { emoji: '🎮', label: 'Pokémon' },
  YUGIOH: { emoji: '⚔️', label: 'Yu-Gi-Oh!' },
  ONE_PIECE: { emoji: '☠️', label: 'One Piece' },
  DIGIMON: { emoji: '🦕', label: 'Digimon' },
  WEISS_SCHWARZ: { emoji: '🌸', label: 'Weiss Schwarz' },
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

// Mapeo de rareza a nivel para ordenamiento (mayor rareza = número mayor)
// Incluye variaciones de múltiples TCGs
const RARITY_LEVEL: Record<string, number> = {
  // Common
  'common': 1,
  'kommon': 1,
  
  // Uncommon
  'uncommon': 2,
  'holo': 2,
  
  // Rare (various rarities across TCGs)
  'rare': 3,
  'holographic rare': 3,
  'shiny rare': 3,
  'reverse holo rare': 3,
  'parallel': 3,
  
  // Super Rare / Ultra Rare
  'super rare': 4,
  'hyper rare': 4,
  'sr': 4,
  'starred rare': 4,
  
  // Ultra Rare / Secret Rare
  'ultra rare': 5,
  'secret rare': 5,
  'rainbow rare': 5,
  'alt art': 5,
  'ur': 5,
  'ssr': 5,
  'gold rare': 5,
  
  // Mythic / Legendary (most rare)
  'mythic': 6,
  'mythic rare': 6,
  'legendary': 6,
  'ultimate rare': 6,
  'pr': 6,
};

function getRarityLevel(rarity?: string): number {
  if (!rarity) return 0;
  const lower = rarity.toLowerCase().trim();
  const mapped = RARITY_LEVEL[lower];
  
  // Si está en el mapeo, usa ese valor
  if (mapped !== undefined) return mapped;
  
  // Si no está mapeado pero contiene caracteres indicadores, asigna un nivel heurístico
  if (/secret|ultimate|rainbow|mythic|legend/.test(lower)) return 6;
  if (/ultra|gold/.test(lower)) return 5;
  if (/super|hyper|star/.test(lower)) return 4;
  if (/rare|holo|parallel/.test(lower)) return 3;
  if (/uncommon|holo/.test(lower)) return 2;
  if (/common/.test(lower)) return 1;
  
  // Default para rarezas desconocidas: nivel 1
  return 1;
}

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
  const [cardSearch, setCardSearch] = useState('');
  const [sortColumn, setSortColumn] = useState<'number' | 'name' | 'rarity' | 'stock' | 'price' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const [loadingTcgs, setLoadingTcgs] = useState(false);
  const [loadingEditions, setLoadingEditions] = useState(false);
  const [loadingCards, setLoadingCards] = useState(false);
  const [tcgsLoadError, setTcgsLoadError] = useState<string | null>(null);
  const [editionsLoadError, setEditionsLoadError] = useState<string | null>(null);
  const [cardsLoadError, setCardsLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [dirtyRows, setDirtyRows] = useState<Map<string, number>>(new Map());
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [updatingPricingId, setUpdatingPricingId] = useState<string | null>(null);
  const [manualPriceDrafts, setManualPriceDrafts] = useState<Record<string, string>>({});

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [previewCardId, setPreviewCardId] = useState<string | null>(null);
  const [pinnedPreviewCardId, setPinnedPreviewCardId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadTcgs = useCallback(async (reason: 'initial-load' | 'manual-retry') => {
    setLoadingTcgs(true);
    setTcgsLoadError(null);
    try {
      const data = await getTCGs();
      setTcgs(data);
    } catch (err) {
      setTcgsLoadError('No se pudo cargar la lista de juegos.');
      logClientError({
        area: 'inventory-page',
        action: 'load-tcgs',
        message: 'Failed loading TCG options in inventory page',
        context: { reason },
        error: err,
      });
    } finally {
      setLoadingTcgs(false);
    }
  }, []);

  useEffect(() => {
    void loadTcgs('initial-load');
  }, [loadTcgs]);

  const loadEditions = useCallback(async (tcgId: string, reason: 'tcg-change' | 'manual-retry') => {
    setLoadingEditions(true);
    setEditionsLoadError(null);
    setEditions([]);
    setSelectedEdition(null);
    setCards([]);
    setDirtyRows(new Map());
    try {
      const data = await getEditions({ tcgId });
      setEditions(data);
    } catch (err) {
      setEditionsLoadError('No se pudieron cargar las ediciones para el juego seleccionado.');
      logClientError({
        area: 'inventory-page',
        action: 'load-editions',
        message: 'Failed loading editions for selected TCG',
        context: { tcgId, reason },
        error: err,
      });
    } finally {
      setLoadingEditions(false);
    }
  }, []);

  const loadCards = useCallback(async (
    editionId: string,
    editionCode: string | undefined,
    tcgId: string | undefined,
    reason: 'edition-change' | 'csv-refresh' | 'manual-retry',
  ) => {
    setLoadingCards(true);
    setCardsLoadError(null);
    setCards([]);
    setDirtyRows(new Map());
    setPreviewCardId(null);
    setPinnedPreviewCardId(null);
    try {
      const inv = await getEditionCardsWithStock(editionId, editionCode, tcgId);
      setCards(inv.cards);
    } catch (err) {
      setCardsLoadError('No se pudieron cargar las cartas de la edición seleccionada.');
      logClientError({
        area: 'inventory-page',
        action: 'load-cards',
        message: 'Failed loading cards with stock for selected edition',
        context: { editionId, editionCode, tcgId, reason },
        error: err,
      });
    } finally {
      setLoadingCards(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedTcg) return;
    void loadEditions(selectedTcg, 'tcg-change');
  }, [selectedTcg, loadEditions]);

  const selectedEditionObj = editions.find((e) => e.id === selectedEdition);

  useEffect(() => {
    if (!selectedEdition) return;
    void loadCards(
      selectedEdition,
      selectedEditionObj?.editionCode,
      selectedTcg || selectedEditionObj?.tcgId || undefined,
      'edition-change',
    );
  }, [selectedEdition, selectedEditionObj, selectedTcg, loadCards]);

  useEffect(() => {
    if (!cards.length) {
      setPreviewCardId(null);
      setPinnedPreviewCardId(null);
      return;
    }

    setPreviewCardId((currentId) => {
      if (currentId && cards.some((card) => card.id === currentId)) {
        return currentId;
      }
      return cards[0].id;
    });
  }, [cards]);

  const filteredEditions = editions.filter((e) =>
    e.editionName.toLowerCase().includes(setSearch.toLowerCase()) ||
    e.editionCode.toLowerCase().includes(setSearch.toLowerCase())
  );

  const filteredCards = cards.filter((c) => {
    if (!cardSearch.trim()) return true;
    const q = cardSearch.toLowerCase();
    return (
      c.cardName.toLowerCase().includes(q) ||
      (c.cardCode ?? '').toLowerCase().includes(q) ||
      (c.cardNumber ?? '').toLowerCase().includes(q)
    );
  });

  const handleSortColumn = (column: 'number' | 'name' | 'rarity' | 'stock' | 'price') => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedCards = [...filteredCards].sort((a, b) => {
    const mult = sortDirection === 'asc' ? 1 : -1;
    
    switch (sortColumn) {
      case 'number': {
        const numA = parseInt(a.cardNumber ?? '0', 10) || 0;
        const numB = parseInt(b.cardNumber ?? '0', 10) || 0;
        return mult * (numA - numB);
      }
      case 'name':
        return mult * a.cardName.localeCompare(b.cardName);
      case 'rarity': {
        const rarityA = getRarityLevel(a.rarity);
        const rarityB = getRarityLevel(b.rarity);
        return mult * (rarityA - rarityB);
      }
      case 'stock': {
        const qtyA = a.listings[0]?.quantity ?? 0;
        const qtyB = b.listings[0]?.quantity ?? 0;
        return mult * (qtyA - qtyB);
      }
      case 'price': {
        const priceA = a.listings[0]?.finalPrice ?? 0;
        const priceB = b.listings[0]?.finalPrice ?? 0;
        return mult * (priceA - priceB);
      }
      default:
        return 0;
    }
  });

  const previewCard = sortedCards.find((card) => card.id === previewCardId) ?? sortedCards[0] ?? null;
  const isPreviewPinned = pinnedPreviewCardId !== null;

  const setHoveredPreviewCard = useCallback((cardId: string) => {
    if (pinnedPreviewCardId) return;
    setPreviewCardId(cardId);
  }, [pinnedPreviewCardId]);

  const togglePinnedPreviewCard = useCallback((cardId: string) => {
    setPreviewCardId(cardId);
    setPinnedPreviewCardId((currentId) => (currentId === cardId ? null : cardId));
  }, []);

  const clearPinnedPreviewCard = useCallback(() => {
    setPinnedPreviewCardId(null);
  }, []);

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

  const adjustQty = useCallback((listingId: string, currentQty: number, delta: number) => {
    const newQty = Math.max(0, currentQty + delta);
    setDirtyRows((prev) => {
      const next = new Map(prev);
      next.set(listingId, newQty);
      return next;
    });
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
      setError('Error al descargar plantilla CSV');
      logClientError({
        area: 'inventory-page',
        action: 'download-template-csv',
        message: 'Failed downloading inventory CSV template',
        context: { selectedEdition },
      });
    }
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importInventoryCsv(file);
      setSuccessMsg('CSV importado correctamente. Recargando…');
      if (selectedEdition) {
        void loadCards(
          selectedEdition,
          selectedEditionObj?.editionCode,
          selectedTcg || selectedEditionObj?.tcgId || undefined,
          'csv-refresh',
        );
      }
    } catch (err) {
      setError('Error al importar CSV');
      logClientError({
        area: 'inventory-page',
        action: 'import-inventory-csv',
        message: 'Failed importing inventory CSV in inventory page',
        context: { selectedEdition },
        error: err,
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getDisplayQty = (listing: CardWithStock['listings'][number]) => {
    return dirtyRows.has(listing.id) ? dirtyRows.get(listing.id)! : listing.quantity;
  };

  const setInventoryPricingMode = useCallback(async (listing: CardWithStock['listings'][number], mode: 'manual' | 'api') => {
    setUpdatingPricingId(listing.id);
    setError(null);
    try {
      if (mode === 'manual') {
        const draft = manualPriceDrafts[listing.id] ?? String(Math.round(listing.finalPrice || 0));
        const manualPrice = parsePositiveNumberInput(draft);
        if (!manualPrice) {
          setError('Ingresa un precio final en CLP valido (> 0).');
          return;
        }
        await updateListingPricingMode(listing.id, 'manual', manualPrice);
      } else {
        await updateListingPricingMode(listing.id, 'api');
      }

      setCards((prev) =>
        prev.map((card) => ({
          ...card,
          listings: card.listings.map((row) =>
            row.id === listing.id
              ? {
                  ...row,
                  status: mode === 'manual' ? 'manual' : 'active',
                  finalPrice:
                    mode === 'manual'
                      ? Number(manualPriceDrafts[listing.id] ?? Math.round(row.finalPrice || 0))
                      : row.finalPrice,
                }
              : row,
          ),
        })),
      );
      setSuccessMsg(mode === 'manual' ? 'Modo manual activado para la carta con stock activo.' : 'Modo API restaurado para la carta.');
      setTimeout(() => setSuccessMsg(null), 2500);
    } catch {
      setError('No se pudo actualizar el modo de precio para esta carta');
    } finally {
      setUpdatingPricingId(null);
    }
  }, [manualPriceDrafts]);

  const fmtCLP = (n: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

  const fallbackTcgs: TCG[] = Object.keys(TCG_META).map((k) => ({
    id: k,
    name: k,
    displayName: TCG_META[k].label,
  }));

  const displayTcgs = tcgs.length > 0 ? tcgs : fallbackTcgs;

  return (
    <div>
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
            <>
              {tcgsLoadError && (
                <div className="error-message" style={{ marginBottom: 8 }}>
                  {tcgsLoadError}
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ marginLeft: 8 }}
                    onClick={() => {
                      void loadTcgs('manual-retry');
                    }}
                  >
                    Reintentar
                  </button>
                </div>
              )}
              {displayTcgs.map((tcg) => {
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
              })}
            </>
          )}
        </div>

        {/* Column 2: Set list */}
        <div className="inventory-col-sets">
          <div className="section-title">Edición</div>
          {selectedTcg ? (
            <>
              <input
                type="text"
                className="input input-sm"
                placeholder="Buscar set…"
                value={setSearch}
                onChange={(e) => setSetSearch(e.target.value)}
                style={{ marginBottom: 8 }}
                title="Filtra ediciones por nombre o código"
              />
              <div style={{ marginBottom: 8, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Selecciona una edición para cargar sus cartas y editar stock manualmente.
              </div>
              {loadingEditions ? (
                <div className="loading-spinner" style={{ padding: 20 }}>⏳</div>
              ) : editionsLoadError ? (
                <div className="error-message" style={{ padding: 12 }}>
                  {editionsLoadError}
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ marginLeft: 8 }}
                    onClick={() => {
                      if (!selectedTcg) return;
                      void loadEditions(selectedTcg, 'manual-retry');
                    }}
                  >
                    Reintentar
                  </button>
                </div>
              ) : filteredEditions.length === 0 ? (
                <div className="empty-state" style={{ padding: 20 }}>
                  <div>Sin ediciones disponibles</div>
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
                    {filteredCards.length !== cards.length
                      ? `${filteredCards.length} / ${cards.length} cartas`
                      : `${cards.length} cartas`}
                  </span>
                </span>
              ) : (
                <span style={{ color: 'var(--text-muted)' }}>Selecciona un set</span>
              )}
            </div>
            {selectedEdition && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={handleDownloadTemplate} title="Descarga plantilla CSV para editar cantidades fuera de la app">
                  ⬇ Plantilla CSV
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()} title="Sube un CSV para actualizar stock en lote">
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
                  title="Guarda todos los cambios de stock pendientes"
                >
                  {saving ? '⏳ Guardando…' : `💾 Guardar${dirtyRows.size > 0 ? ` (${dirtyRows.size})` : ''}`}
                </button>
              </div>
            )}
          </div>

          {/* Card search filter */}
          {selectedEdition && cards.length > 0 && (
            <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
              <input
                type="text"
                className="input input-sm"
                placeholder="🔍 Buscar por nombre, código o número…"
                value={cardSearch}
                onChange={(e) => setCardSearch(e.target.value)}
                style={{ flex: 1 }}
                title="Busca cartas por nombre, código interno o número de carta"
              />
              {cardSearch && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setCardSearch('')}
                  title="Limpiar búsqueda"
                >
                  ✕
                </button>
              )}
            </div>
          )}
          {selectedEdition && cards.length > 0 && (
            <div style={{ marginBottom: 10, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Edición rápida: usa + y − para ajustar stock, o clic en el número para editar directo.
            </div>
          )}

          <div className="inventory-cards-pane">
            <div className="table-wrapper inventory-cards-table">
              {!selectedEdition ? (
                <div className="empty-state">
                  <div className="empty-state-icon">📦</div>
                  <h3>Selecciona un set</h3>
                  <p>Elige un juego y una edición para ver las cartas</p>
                </div>
              ) : loadingCards ? (
                <div className="loading-spinner">⏳ Cargando cartas…</div>
              ) : cardsLoadError ? (
                <div className="error-message" style={{ padding: 12 }}>
                  {cardsLoadError}
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ marginLeft: 8 }}
                    onClick={() => {
                      if (!selectedEdition) return;
                      void loadCards(
                        selectedEdition,
                        selectedEditionObj?.editionCode,
                        selectedTcg || selectedEditionObj?.tcgId || undefined,
                        'manual-retry',
                      );
                    }}
                  >
                    Reintentar
                  </button>
                </div>
              ) : cards.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">🔍</div>
                  <h3>Sin cartas</h3>
                  <p>Este set no tiene cartas en el catálogo aún</p>
                </div>
              ) : filteredCards.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">🔍</div>
                  <h3>Sin resultados</h3>
                  <p>No se encontraron cartas con ese término</p>
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th
                        style={{ width: 40, cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => handleSortColumn('number')}
                        title="Clic para ordenar"
                      >
                        # {sortColumn === 'number' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        style={{ cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => handleSortColumn('name')}
                        title="Clic para ordenar"
                      >
                        Nombre {sortColumn === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        style={{ cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => handleSortColumn('rarity')}
                        title="Clic para ordenar"
                      >
                        Rareza {sortColumn === 'rarity' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        style={{ width: 120, cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => handleSortColumn('stock')}
                        title="Clic para ordenar"
                      >
                        Stock {sortColumn === 'stock' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        style={{ cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => handleSortColumn('price')}
                        title="Clic para ordenar"
                      >
                        Precio USD {sortColumn === 'price' && (sortDirection === 'asc' ? '↑' : '↓')}
                      </th>
                      <th>Precio CLP</th>
                      <th style={{ width: 130 }}>Modo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCards.map((card, idx) => {
                      const mainListing = card.listings[0];
                      const isDirty = mainListing ? dirtyRows.has(mainListing.id) : false;
                      const isActivePreview = previewCard?.id === card.id;
                      return (
                        <tr
                          key={card.id}
                          className={`${isDirty ? 'row-dirty' : ''}${isActivePreview ? ' row-preview-active' : ''}`}
                          onMouseEnter={() => setHoveredPreviewCard(card.id)}
                        >
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                            {card.cardNumber ?? idx + 1}
                          </td>
                          <td>
                            <div
                              style={{ fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                              onClick={() => togglePinnedPreviewCard(card.id)}
                              title={pinnedPreviewCardId === card.id ? 'Desfijar vista previa' : 'Fijar vista previa'}
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
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ padding: '1px 6px', minWidth: 24, fontWeight: 700 }}
                                    title="Reducir stock"
                                    onClick={() => adjustQty(mainListing.id, getDisplayQty(mainListing), -1)}
                                  >
                                    −
                                  </button>
                                  <span
                                    className="qty-display"
                                    onClick={() => startEdit(mainListing.id, getDisplayQty(mainListing))}
                                    title="Clic para editar"
                                  >
                                    {getDisplayQty(mainListing)}
                                    <span style={{ fontSize: '0.6rem', opacity: 0.5 }}>✏</span>
                                  </span>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ padding: '1px 6px', minWidth: 24, fontWeight: 700 }}
                                    title="Aumentar stock"
                                    onClick={() => adjustQty(mainListing.id, getDisplayQty(mainListing), +1)}
                                  >
                                    +
                                  </button>
                                </div>
                              )
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>—</span>
                            )}
                          </td>
                          <td style={{ fontSize: '0.8rem' }}>
                            {mainListing?.referencePrice != null && Number.isFinite(mainListing.referencePrice)
                              ? `$${Number(mainListing.referencePrice).toFixed(2)}`
                              : '—'}
                          </td>
                          <td style={{ fontSize: '0.8rem', fontWeight: 500 }}>
                            {mainListing ? (() => {
                              const hasActiveStock = getDisplayQty(mainListing) > 0;
                              const isManual = mainListing.status === 'manual';
                              const draft = manualPriceDrafts[mainListing.id] ?? String(Math.round(mainListing.finalPrice || 0));

                              if (isManual && hasActiveStock) {
                                return (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ fontWeight: 600, color: '#16a34a', fontSize: '0.75rem' }}>CLP</span>
                                    <input
                                      type="number"
                                      className="input input-sm"
                                      value={draft}
                                      onChange={(e) => setManualPriceDrafts((prev) => ({ ...prev, [mainListing.id]: e.target.value }))}
                                      style={{ width: 95, fontSize: '0.85rem', padding: '4px 8px' }}
                                      disabled={updatingPricingId === mainListing.id}
                                      title="Precio final manual en CLP"
                                      onBlur={() => { void setInventoryPricingMode(mainListing, 'manual'); }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          void setInventoryPricingMode(mainListing, 'manual');
                                        }
                                      }}
                                    />
                                  </div>
                                );
                              }

                              return mainListing.finalPrice ? fmtCLP(mainListing.finalPrice) : '—';
                            })() : '—'}
                          </td>
                          <td>
                            {mainListing ? (() => {
                              const hasActiveStock = getDisplayQty(mainListing) > 0;
                              const isManual = mainListing.status === 'manual';

                              return (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  disabled={!hasActiveStock || updatingPricingId === mainListing.id}
                                  title={
                                    !hasActiveStock
                                      ? 'El modo manual solo se habilita para cartas con stock activo (> 0)'
                                      : isManual
                                        ? 'Cambiar a modo API'
                                        : 'Cambiar a modo manual'
                                  }
                                  onClick={() => {
                                    if (!hasActiveStock) return;
                                    if (!isManual) {
                                      setManualPriceDrafts((prev) => ({
                                        ...prev,
                                        [mainListing.id]: prev[mainListing.id] ?? String(Math.round(mainListing.finalPrice || 0)),
                                      }));
                                      void setInventoryPricingMode(mainListing, 'manual');
                                      return;
                                    }
                                    void setInventoryPricingMode(mainListing, 'api');
                                  }}
                                >
                                  {isManual ? 'Manual' : 'API'}
                                </button>
                              );
                            })() : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <aside className="inventory-preview-panel">
              <div className="flex items-center justify-between gap-2" style={{ marginBottom: 10 }}>
                <div className="section-title">Vista previa</div>
                {previewCard && isPreviewPinned && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={clearPinnedPreviewCard}
                    title="Liberar vista previa fija"
                  >
                    Fijada
                  </button>
                )}
              </div>
              {previewCard ? (
                <>
                  {isPreviewPinned && (
                    <div className="badge badge-gray" style={{ marginBottom: 10 }}>
                      Vista fija: el hover no cambia la carta
                    </div>
                  )}
                  <div className="inventory-preview-frame">
                    {previewCard.imageUrl ? (
                      <img
                        src={previewCard.imageUrl}
                        alt={previewCard.cardName}
                        className="inventory-preview-image"
                      />
                    ) : (
                      <div className="inventory-preview-empty">Sin imagen disponible</div>
                    )}
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>
                      {previewCard.cardName}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                      {previewCard.cardCode || '—'}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                      {previewCard.rarity ? (
                        <span className={`badge ${getRarityBadge(previewCard.rarity)}`}>{previewCard.rarity}</span>
                      ) : null}
                      <span className="badge badge-gray">{previewCard.cardNumber ?? '—'}</span>
                    </div>
                    {previewCard.listings[0] && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Stock: {getDisplayQty(previewCard.listings[0])} · Precio: {previewCard.listings[0].finalPrice ? fmtCLP(previewCard.listings[0].finalPrice) : '—'}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="inventory-preview-empty">Selecciona una carta para verla ampliada</div>
              )}
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

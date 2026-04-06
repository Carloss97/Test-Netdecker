import { useState } from 'react';
import {
  searchExternalCards,
  importExternalCard,
  importExternalSearch,
  importExternalSet,
  listExternalSets,
} from '../services/catalog';
import type { ExternalCard, ExternalEdition } from '../types';


type TCGParam = 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ';

const TCG_LABELS: Record<TCGParam, string> = {
  MAGIC: 'Magic: The Gathering',
  POKEMON: 'Pokémon',
  YUGIOH: 'Yu-Gi-Oh!',
  ONE_PIECE: 'One Piece',
  DIGIMON: 'Digimon Card Game',
  WEISS_SCHWARZ: 'Weiss Schwarz',
};

const SOURCE_LABELS: Record<string, string> = {
  scryfall: 'Scryfall',
  pokemontcg: 'Pokémon TCG API',
  ygoprodeck: 'YGOPRODeck',
  onepiecetcg: 'One Piece TCG',
  tcgcsv: 'TCGCsv (TCGplayer)',
};

function PriceTag({ label, value }: { label: string; value?: number }) {
  if (value === undefined || value === null) return null;
  return (
    <span
      style={{
        marginRight: 6,
        padding: '2px 6px',
        borderRadius: 4,
        background: '#e8f5e9',
        fontSize: 12,
        color: '#2e7d32',
      }}
    >
      {label}: ${value.toFixed(2)}
    </span>
  );
}

interface ImportCardModalProps {
  card: ExternalCard;
  onClose: () => void;
  onImported: (msg: string) => void;
}

function ImportCardModal({ card, onClose, onImported }: ImportCardModalProps) {
  const [createListing, setCreateListing] = useState(false);
  const [referencePrice, setReferencePrice] = useState(
    String(card.priceMarket ?? card.priceMid ?? card.priceLow ?? ''),
  );
  const [marginMultiplier, setMarginMultiplier] = useState('1.0');
  const [quantity, setQuantity] = useState('0');
  const [condition, setCondition] = useState('NM');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await importExternalCard({
        tcg: card.tcg,
        cardId: card.externalId,
        createListing,
        referencePrice: createListing ? parseFloat(referencePrice) : undefined,
        marginMultiplier: createListing ? parseFloat(marginMultiplier) : undefined,
        quantity: createListing ? parseInt(quantity, 10) : undefined,
        condition: createListing ? condition : undefined,
      });
      const action = result.result?.action ?? 'imported';
      onImported(`Card "${card.cardName}" ${action} successfully.`);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          padding: 24,
          width: 420,
          maxWidth: '90vw',
        }}
      >
        <h3 style={{ marginTop: 0 }}>Import: {card.cardName}</h3>
        <p style={{ color: '#555', fontSize: 13 }}>
          {card.editionName} · {card.rarity ?? '—'} · Source:{' '}
          {SOURCE_LABELS[card.source] ?? card.source}
        </p>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={createListing}
            onChange={(e) => setCreateListing(e.target.checked)}
          />
          Create/update listing in inventory
        </label>

        {createListing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label>
              Reference Price (USD)
              <input
                type="number"
                step="0.01"
                min="0"
                value={referencePrice}
                onChange={(e) => setReferencePrice(e.target.value)}
                style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }}
              />
            </label>
            <label>
              Margin Multiplier
              <input
                type="number"
                step="0.05"
                min="1"
                value={marginMultiplier}
                onChange={(e) => setMarginMultiplier(e.target.value)}
                style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }}
              />
            </label>
            <label>
              Quantity
              <input
                type="number"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }}
              />
            </label>
            <label>
              Condition
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }}
              >
                {['NM', 'LP', 'MP', 'HP', 'DMG'].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {error && <p style={{ color: 'red', marginTop: 10 }}>{error}</p>}

        <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
          <button onClick={handleImport} disabled={loading} style={{ padding: '8px 16px' }}>
            {loading ? 'Importing…' : 'Import'}
          </button>
          <button onClick={onClose} style={{ padding: '8px 16px' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function ExternalCardSearch() {
  const [tcg, setTcg] = useState<TCGParam>('MAGIC');
  const [query, setQuery] = useState('');
  const [setCode, setSetCode] = useState('');
  const [results, setResults] = useState<ExternalCard[]>([]);
  const [sets, setSets] = useState<ExternalEdition[]>([]);
  const [loadingSets, setLoadingSets] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalCard, setModalCard] = useState<ExternalCard | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Bulk import state
  const [importingAll, setImportingAll] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    total: number;
    created: number;
    updated: number;
    skipped: number;
  } | null>(null);
  const [importSetCode, setImportSetCode] = useState('');

  const handleLoadSets = async () => {
    setLoadingSets(true);
    setSets([]);
    setError(null);
    try {
      const res = await listExternalSets(tcg);
      setSets(res.sets ?? []);
      if (!res.sets || res.sets.length === 0) {
        setError(`No se encontraron sets para ${TCG_LABELS[tcg]}. Intenta nuevamente en unos segundos.`);
      }
    } catch (err: unknown) {
      setSets([]);
      setError(err instanceof Error ? err.message : `No se pudieron cargar sets para ${TCG_LABELS[tcg]}`);
    } finally {
      setLoadingSets(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResults([]);
    setBulkResult(null);
    try {
      const res = await searchExternalCards(tcg, query.trim(), {
        setCode: setCode.trim() || undefined,
      });
      setResults(res.cards ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleImportAll = async () => {
    if (!query.trim()) return;
    setImportingAll(true);
    setBulkResult(null);
    setError(null);
    try {
      const res = await importExternalSearch({
        tcg,
        query: query.trim(),
        setCode: setCode.trim() || undefined,
        createListing: false,
      });
      setBulkResult({
        total: res.total,
        created: res.created,
        updated: res.updated,
        skipped: res.skipped,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Bulk import failed');
    } finally {
      setImportingAll(false);
    }
  };

  const handleImportSet = async () => {
    if (!importSetCode.trim()) return;
    setImportingAll(true);
    setBulkResult(null);
    setError(null);
    try {
      const res = await importExternalSet({
        tcg,
        setCode: importSetCode.trim(),
        createListing: false,
      });
      setBulkResult({
        total: res.total,
        created: res.created,
        updated: res.updated,
        skipped: res.skipped,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Set import failed');
    } finally {
      setImportingAll(false);
    }
  };

  return (
    <div className="section-card" style={{ marginTop: 24 }}>
      <div className="hero-panel" style={{ marginBottom: 20 }}>
        <span className="badge" style={{ marginBottom: 10 }}>📦 External Data Sources</span>
        <h2 className="hero-title">Search & Import Cards from Official TCG APIs</h2>
        <p className="hero-subtitle">
          Browse, preview prices and images, then import cards for Magic, Pokémon, Yu-Gi-Oh!, One Piece, Digimon, and Weiss Schwarz directly to your catalog with a streamlined workflow designed for fast operations.
        </p>
      </div>

      {/* TCG selector */}
      <div className="surface-card" style={{ marginBottom: 16, padding: 16 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 10, color: '#333' }}>Select TCG</label>
        <p style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
          <strong>💡</strong> Search and import cards from Magic, Pokémon, Yu-Gi-Oh!, One Piece, Digimon, and Weiss Schwarz. Each TCG uses its native API for accurate data.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(Object.keys(TCG_LABELS) as TCGParam[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTcg(t);
                setResults([]);
                setSets([]);
                setBulkResult(null);
              }}
              style={{
                padding: '8px 14px',
                borderRadius: 6,
                border: tcg === t ? '2px solid #1976d2' : '1px solid #ddd',
                background: tcg === t ? '#1976d2' : '#fff',
                color: tcg === t ? '#fff' : '#333',
                cursor: 'pointer',
                fontWeight: tcg === t ? 600 : 400,
                transition: 'all 0.2s'
              }}
            >
              {TCG_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} className="surface-card" style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', padding: 16, alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Card Name</label>
          <input
            type="text"
            placeholder="e.g. Blue-Eyes, Pikachu…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ padding: '8px 10px', width: '100%', border: '1px solid #ddd', borderRadius: 4 }}
          />
        </div>
        <div style={{ flex: '0 1 140px' }}>
          <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Set Code</label>
          <input
            type="text"
            placeholder="Optional"
            value={setCode}
            onChange={(e) => setSetCode(e.target.value)}
            style={{ padding: '8px 10px', width: '100%', border: '1px solid #ddd', borderRadius: 4 }}
          />
        </div>
        <button type="submit" disabled={loading} style={{ padding: '8px 16px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          {loading ? '🔍 Searching…' : '🔍 Search'}
        </button>
        {results.length > 0 && (
          <button
            type="button"
            onClick={handleImportAll}
            disabled={importingAll}
            style={{ padding: '8px 16px', background: '#388e3c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            {importingAll ? '⬆ Importing…' : `⬆ Import All (${results.length})`}
          </button>
        )}
      </form>

      {/* Set bulk import */}
      <div className="surface-card" style={{ marginBottom: 20, padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Import Full Set</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Import full set by code (e.g. MH3, SV05, OP-01)"
            value={importSetCode}
            onChange={(e) => setImportSetCode(e.target.value)}
            style={{ padding: '8px', flex: 1, minWidth: 200 }}
          />
          <button
            onClick={handleImportSet}
            disabled={importingAll || !importSetCode.trim()}
            style={{ padding: '8px 16px', background: '#7b1fa2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            {importingAll ? 'Importing…' : 'Import Set'}
          </button>
          <button
            onClick={handleLoadSets}
            disabled={loadingSets}
            style={{ padding: '8px 16px', cursor: 'pointer' }}
          >
            {loadingSets ? 'Loading…' : 'Browse Sets'}
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 4, padding: 12, marginBottom: 12, color: '#c62828', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>❌</span>
          <div>{error}</div>
        </div>
      )}
      {successMsg && (
        <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: 4, padding: 12, marginBottom: 12, color: '#2e7d32', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>✅</span>
          <div>{successMsg}</div>
        </div>
      )}
      {bulkResult && (
        <div style={{ background: '#e3f2fd', border: '1px solid #90caf9', borderRadius: 4, padding: 12, marginBottom: 12, display: 'flex', gap: 16, alignItems: 'center' }}>
          <span>📦</span>
          <div>
            <strong>Import complete</strong> — Total: <strong>{bulkResult.total}</strong> | Created: <strong>{bulkResult.created}</strong> | Updated: <strong>{bulkResult.updated}</strong> | Skipped: <strong>{bulkResult.skipped}</strong>
          </div>
        </div>
      )}

      {/* Sets list */}
      {sets.length > 0 && (
        <div className="surface-card" style={{ marginBottom: 20, padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Available Sets ({sets.length})</h3>
          <div style={{ maxHeight: 350, overflowY: 'auto', border: '1px solid #eee', borderRadius: 4 }}>
            {sets.map((s) => (
              <div
                key={s.code}
                style={{
                  padding: '10px 12px',
                  borderBottom: '1px solid #f5f5f5',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'background 0.2s',
                  backgroundColor: importSetCode === s.code ? '#f0f4ff' : 'transparent'
                }}
                onClick={() => setImportSetCode(s.code)}
                onMouseEnter={(e) => { if (importSetCode !== s.code) e.currentTarget.style.backgroundColor = '#f9f9f9'; }}
                onMouseLeave={(e) => { if (importSetCode !== s.code) e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <div>
                  <strong style={{ color: '#1976d2', fontSize: 13 }}>{s.code}</strong>
                  <span style={{ marginLeft: 8, color: '#333' }}>{s.name}</span>
                </div>
                <span style={{ color: '#888', fontSize: 12, whiteSpace: 'nowrap', marginLeft: 12 }}>
                  {s.totalCards != null ? `${s.totalCards} cards` : ''}
                  {s.releaseDate ? ` • ${s.releaseDate}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results grid */}
      {results.length > 0 && (
        <div>
          <h3>Search Results ({results.length})</h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 12,
            }}
          >
            {results.map((card) => (
              <div
                key={card.externalId}
                style={{
                  border: '1px solid #e0e0e0',
                  borderRadius: 8,
                  padding: 10,
                  background: '#fff',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  transition: 'box-shadow 0.2s, transform 0.2s',
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.12)'
                }}
                onClick={() => setModalCard(card)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.12)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {card.imageUrl && (
                  <img
                    src={card.imageUrl}
                    alt={card.cardName}
                    style={{ width: '100%', borderRadius: 4, objectFit: 'contain', maxHeight: 180 }}
                    loading="lazy"
                  />
                )}
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: 13, lineHeight: 1.3 }}>{card.cardName}</strong>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                    {card.editionName}
                    {card.cardNumber ? ` #${card.cardNumber}` : ''}
                  </div>
                </div>
                {card.rarity && (
                  <span style={{ fontSize: 10, color: '#1976d2', fontWeight: 500 }}>
                    {card.rarity}
                  </span>
                )}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <PriceTag label="Low" value={card.priceLow} />
                  <PriceTag label="Mid" value={card.priceMid} />
                  <PriceTag label="Mkt" value={card.priceMarket} />
                </div>
                <span style={{ fontSize: 10, color: '#aaa' }}>
                  {SOURCE_LABELS[card.source] ?? card.source}
                </span>
                <button
                  onClick={() => setModalCard(card)}
                  style={{
                    marginTop: 4,
                    padding: '5px 10px',
                    background: '#1976d2',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  Import…
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Import modal */}
      {modalCard && (
        <ImportCardModal
          card={modalCard}
          onClose={() => setModalCard(null)}
          onImported={(msg) => {
            setSuccessMsg(msg);
            setTimeout(() => setSuccessMsg(null), 5000);
          }}
        />
      )}
    </div>
  );
}

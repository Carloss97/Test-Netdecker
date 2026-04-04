import { useState } from 'react';
import {
  searchExternalCards,
  importExternalCard,
  importExternalSearch,
  importExternalSet,
  listExternalSets,
} from '../services/catalog';
import type { ExternalCard, ExternalEdition } from '../types';


type TCGParam = 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE';

const TCG_LABELS: Record<TCGParam, string> = {
  MAGIC: 'Magic: The Gathering',
  POKEMON: 'Pokémon',
  YUGIOH: 'Yu-Gi-Oh!',
  ONE_PIECE: 'One Piece',
};

const SOURCE_LABELS: Record<string, string> = {
  scryfall: 'Scryfall',
  pokemontcg: 'Pokémon TCG API',
  ygoprodeck: 'YGOPRODeck',
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
  const [marginMultiplier, setMarginMultiplier] = useState('1.2');
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
    try {
      const res = await listExternalSets(tcg);
      setSets(res.sets ?? []);
    } catch {
      setSets([]);
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
        <span className="badge" style={{ marginBottom: 10 }}>Bases externas</span>
        <h2 className="hero-title">Importa sets completos desde fuentes oficiales</h2>
        <p className="hero-subtitle">
          Busca, revisa imágenes y precios, y manda al catálogo local cartas de Magic, Pokémon y Yu-Gi-Oh! con un flujo pensado para operación rápida.
        </p>
      </div>

      {/* TCG selector */}
      <div className="surface-card" style={{ marginBottom: 16, padding: 16 }}>
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
              marginRight: 8,
              padding: '6px 14px',
              borderRadius: 4,
              border: '1px solid #ccc',
              background: tcg === t ? '#1976d2' : '#fff',
              color: tcg === t ? '#fff' : '#333',
              cursor: 'pointer',
            }}
          >
            {TCG_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} className="surface-card" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', padding: 16 }}>
        <input
          type="text"
          placeholder="Card name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ padding: '8px', flex: '1 1 200px' }}
        />
        <input
          type="text"
          placeholder="Set code (optional)"
          value={setCode}
          onChange={(e) => setSetCode(e.target.value)}
          style={{ padding: '8px', width: 140 }}
        />
        <button type="submit" disabled={loading} style={{ padding: '8px 16px' }}>
          {loading ? 'Searching…' : 'Search'}
        </button>
        {results.length > 0 && (
          <button
            type="button"
            onClick={handleImportAll}
            disabled={importingAll}
            style={{ padding: '8px 16px', background: '#388e3c', color: '#fff', border: 'none', borderRadius: 4 }}
          >
            {importingAll ? 'Importing…' : `Import All (${results.length})`}
          </button>
        )}
      </form>

      {/* Set bulk import */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Import full set by code (e.g. MH3)"
          value={importSetCode}
          onChange={(e) => setImportSetCode(e.target.value)}
          style={{ padding: '8px', width: 260 }}
        />
        <button
          onClick={handleImportSet}
          disabled={importingAll || !importSetCode.trim()}
          style={{ padding: '8px 16px', background: '#7b1fa2', color: '#fff', border: 'none', borderRadius: 4 }}
        >
          {importingAll ? 'Importing…' : 'Import Set'}
        </button>
        <button
          onClick={handleLoadSets}
          disabled={loadingSets}
          style={{ padding: '8px 16px' }}
        >
          {loadingSets ? 'Loading…' : 'Browse Sets'}
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 4, padding: 10, marginBottom: 12, color: '#c62828' }}>
          {error}
        </div>
      )}
      {successMsg && (
        <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: 4, padding: 10, marginBottom: 12, color: '#2e7d32' }}>
          {successMsg}
        </div>
      )}
      {bulkResult && (
        <div style={{ background: '#e3f2fd', border: '1px solid #90caf9', borderRadius: 4, padding: 10, marginBottom: 12 }}>
          Import complete — total: {bulkResult.total} | created: {bulkResult.created} | updated:{' '}
          {bulkResult.updated} | skipped: {bulkResult.skipped}
        </div>
      )}

      {/* Sets list */}
      {sets.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3>Available Sets ({sets.length})</h3>
          <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #eee', borderRadius: 4 }}>
            {sets.map((s) => (
              <div
                key={s.code}
                style={{ padding: '6px 12px', borderBottom: '1px solid #f5f5f5', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
                onClick={() => setImportSetCode(s.code)}
              >
                <span><strong>{s.code}</strong> — {s.name}</span>
                <span style={{ color: '#888', fontSize: 12 }}>
                  {s.totalCards != null ? `${s.totalCards} cards` : ''}
                  {s.releaseDate ? ` · ${s.releaseDate}` : ''}
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
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 16,
            }}
          >
            {results.map((card) => (
              <div
                key={card.externalId}
                style={{
                  border: '1px solid #e0e0e0',
                  borderRadius: 8,
                  padding: 12,
                  background: '#fff',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                {card.imageUrl && (
                  <img
                    src={card.imageUrl}
                    alt={card.cardName}
                    style={{ width: '100%', borderRadius: 4, objectFit: 'contain', maxHeight: 200 }}
                    loading="lazy"
                  />
                )}
                <strong style={{ fontSize: 14 }}>{card.cardName}</strong>
                <span style={{ fontSize: 12, color: '#555' }}>
                  {card.editionName}
                  {card.cardNumber ? ` #${card.cardNumber}` : ''}
                </span>
                {card.rarity && (
                  <span style={{ fontSize: 11, color: '#888' }}>{card.rarity}</span>
                )}
                <div>
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

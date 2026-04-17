import React, { useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import { getTCGs, searchCards, getListingsByCard } from '../services/catalog';
import { TCG, Card, Listing } from '../types';

interface CatalogProps {
  onOpenPriceDebug?: (listingId: string) => void;
}

export function Catalog({ onOpenPriceDebug }: CatalogProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTCG, setSelectedTCG] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<Card[]>([]);
  const [listingsByCard, setListingsByCard] = useState<Record<string, Listing[]>>({});
  const [loadingListingsCardId, setLoadingListingsCardId] = useState<string | null>(null);

  const tcgsQuery = useAsync(() => getTCGs());
  const tcgs = tcgsQuery.data as TCG[] | null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm) return;

    try {
      const results = await searchCards(searchTerm, selectedTCG || undefined);
      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
    }
  };

  const loadCardListings = async (cardId: string) => {
    try {
      setLoadingListingsCardId(cardId);
      const listings = await getListingsByCard(cardId);
      setListingsByCard((prev) => ({ ...prev, [cardId]: listings }));
    } catch (error) {
      console.error('Listing load error:', error);
    } finally {
      setLoadingListingsCardId(null);
    }
  };

  return (
    <div className="section-card" style={{ marginTop: 24 }}>
      <div className="hero-panel" style={{ marginBottom: 20 }}>
        <span className="badge" style={{ marginBottom: 10 }}>Catálogo vivo</span>
        <h2 className="hero-title">Busca cartas y listings en segundos</h2>
        <p className="hero-subtitle">
          Explora el inventario, filtra por TCG y abre el debug de pricing directamente desde el catálogo.
        </p>
      </div>

      <form onSubmit={handleSearch} className="surface-card" style={{ marginBottom: '20px', padding: 16 }}>
        <input
          type="text"
          placeholder="Search cards by name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ marginRight: '10px', padding: '8px', width: '300px' }}
        />

        <select
          value={selectedTCG || ''}
          onChange={(e) => setSelectedTCG(e.target.value || null)}
          style={{ marginRight: '10px', padding: '8px' }}
        >
          <option value="">All TCGs</option>
          {tcgs?.map((tcg) => (
            <option key={tcg.id} value={tcg.id}>
              {tcg.displayName}
            </option>
          ))}
        </select>

        <button type="submit" style={{ padding: '8px 16px' }}>
          Search
        </button>
      </form>

      {tcgsQuery.status === 'pending' && <p>Loading TCGs...</p>}
      {tcgsQuery.status === 'error' && <p>Error loading TCGs</p>}

      {searchResults.length > 0 && (
        <div>
          <h3>Results ({searchResults.length})</h3>
          <ul>
            {searchResults.map((card) => (
              <li key={card.id} style={{ marginBottom: 10 }}>
                <strong>{card.cardName}</strong> - {card.cardCode}{' '}
                <button type="button" onClick={() => loadCardListings(card.id)}>
                  {loadingListingsCardId === card.id ? 'Cargando...' : 'Ver listings'}
                </button>

                {listingsByCard[card.id]?.length ? (
                  <ul style={{ marginTop: 8 }}>
                    {listingsByCard[card.id].map((listing) => (
                      <li key={listing.id}>
                        {listing.condition} | Stock: {listing.quantity} | Precio: {Number(listing.finalPrice ?? 0).toFixed(0)} CLP{' '}
                        {onOpenPriceDebug && (
                          <button type="button" onClick={() => onOpenPriceDebug(listing.id)}>
                            Debug precio
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

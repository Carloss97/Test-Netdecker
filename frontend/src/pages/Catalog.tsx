import React, { useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import { getTCGs, searchCards, getListingsByCard } from '../services/catalog';
import { TCG, Card, Listing } from '../types';
import { logClientError } from '../utils/observability';

interface CatalogProps {
  onOpenPriceDebug?: (listingId: string) => void;
}

export function Catalog({ onOpenPriceDebug }: CatalogProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTCG, setSelectedTCG] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<Card[]>([]);
  const [listingsByCard, setListingsByCard] = useState<Record<string, Listing[]>>({});
  const [loadingListingsCardId, setLoadingListingsCardId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [listingsErrorByCard, setListingsErrorByCard] = useState<Record<string, string>>({});

  const tcgsQuery = useAsync(() => getTCGs());
  const tcgs = tcgsQuery.data as TCG[] | null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm) return;

    setIsSearching(true);
    setSearchError(null);
    setHasSearched(true);

    try {
      const results = await searchCards(searchTerm, selectedTCG || undefined);
      setSearchResults(results);
    } catch (error) {
      setSearchResults([]);
      setSearchError('No se pudo completar la busqueda. Intenta nuevamente.');
      logClientError({
        area: 'catalog-page',
        action: 'search-cards',
        message: 'Failed searching cards from catalog page',
        context: { query: searchTerm, tcgId: selectedTCG ?? null },
        error,
      });
    } finally {
      setIsSearching(false);
    }
  };

  const loadCardListings = async (cardId: string) => {
    try {
      setLoadingListingsCardId(cardId);
      setListingsErrorByCard((prev) => {
        const next = { ...prev };
        delete next[cardId];
        return next;
      });

      const listings = await getListingsByCard(cardId);
      setListingsByCard((prev) => ({ ...prev, [cardId]: listings }));
    } catch (error) {
      setListingsErrorByCard((prev) => ({
        ...prev,
        [cardId]: 'No se pudieron cargar los listings de esta carta.',
      }));
      logClientError({
        area: 'catalog-page',
        action: 'load-card-listings',
        message: 'Failed loading listings for selected card',
        context: { cardId },
        error,
      });
    } finally {
      setLoadingListingsCardId(null);
    }
  };

  const retrySearch = async () => {
    if (!searchTerm.trim()) return;
    await handleSearch({ preventDefault: () => {} } as React.FormEvent);
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
          {isSearching ? 'Buscando...' : 'Search'}
        </button>
      </form>

      {tcgsQuery.status === 'pending' && <p>Loading TCGs...</p>}
      {tcgsQuery.status === 'error' && (
        <div className="error-message" style={{ marginBottom: 12 }}>
          Error cargando TCGs.
          <button type="button" className="btn btn-sm" style={{ marginLeft: 8 }} onClick={tcgsQuery.execute}>
            Reintentar
          </button>
        </div>
      )}

      {searchError && (
        <div className="error-message" style={{ marginBottom: 12 }}>
          {searchError}
          <button type="button" className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => void retrySearch()}>
            Reintentar
          </button>
        </div>
      )}

      {hasSearched && !isSearching && !searchError && searchResults.length === 0 && (
        <p className="empty-state" style={{ padding: 12 }}>No se encontraron cartas para ese criterio.</p>
      )}

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

                {listingsErrorByCard[card.id] && (
                  <div className="error-message" style={{ marginTop: 8 }}>
                    {listingsErrorByCard[card.id]}
                    <button type="button" className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => void loadCardListings(card.id)}>
                      Reintentar
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

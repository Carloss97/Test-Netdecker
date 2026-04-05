// Frontend types
export interface TCG {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  editions?: Edition[];
}

export interface Edition {
  id: string;
  tcgId: string;
  editionCode: string;
  editionName: string;
  releaseDate?: string;
  isActive: boolean;
}

export interface Card {
  id: string;
  tcgId: string;
  editionId: string;
  cardCode: string;
  cardName: string;
  cardNumber?: string;
  rarity?: string;
  colorIdentity?: string;
  tags?: string;
  imageUrl?: string;
  description?: string;
}

export interface Listing {
  id: string;
  cardId: string;
  card: Card;
  editionId: string;
  condition: 'NM' | 'LP' | 'MP' | 'HP' | 'DMG';
  quantity: number;
  referencePrice: number;
  marginMultiplier: number;
  exchangeRate: number;
  finalPrice: number;
  currency: string;
  status: string;
  lastSyncedAt?: string;
}

export interface CartItem {
  listingId: string;
  quantity: number;
  pricePerUnit: number;
}

export interface InventoryValue {
  totalCost: number;
  totalValue: number;
  totalProfit: number;
  itemCount: number;
}

// External card database types
export interface ExternalCard {
  externalId: string;
  source: 'scryfall' | 'pokemontcg' | 'ygoprodeck' | 'onepiecetcg' | 'tcgcsv';
  tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ';
  cardName: string;
  cardNumber?: string;
  editionCode: string;
  editionName: string;
  rarity?: string;
  colorIdentity?: string;
  imageUrl?: string;
  description?: string;
  tags?: string;
  priceLow?: number;
  priceMid?: number;
  priceMarket?: number;
}

export interface ExternalEdition {
  code: string;
  name: string;
  releaseDate?: string;
  totalCards?: number;
  source: 'scryfall' | 'pokemontcg' | 'ygoprodeck';
}

export interface AdminDashboard {
  kpis: {
    catalog: {
      totalCards: number;
      totalListings: number;
      activeListings: number;
      lowStockListings: number;
      outOfStockListings: number;
    };
    inventory: {
      totalValueCLP: number;
      currency: string;
    };
    orders: {
      total: number;
      pending: number;
    };
    exchangeRate: {
      usdToCLP: number;
      source: string;
      fetchedAt?: string;
    } | null;
  };
  recentImports: Array<{
    id: string;
    fileName: string;
    status: string;
    totalRecords: number;
    successCount: number;
    failureCount: number;
    createdAt: string;
  }>;
  recentSyncRuns: Array<{
    id: string;
    source: string;
    status: string;
    total: number;
    updated: number;
    volatile: number;
    failed: number;
    startedAt: string;
    completedAt?: string;
  }>;
}

export interface TcgplayerCoverageByTcg {
  tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ';
  tcgDisplayName: string;
  totalCards: number;
  coveredCards: number;
  uncoveredCards: number;
  coveragePercent: number;
}

export interface TcgplayerCoverage {
  global: {
    totalCards: number;
    coveredCards: number;
    uncoveredCards: number;
    coveragePercent: number;
  };
  byTcg: TcgplayerCoverageByTcg[];
}

export interface CatalogBootstrapResponse {
  dryRun: boolean;
  created: number;
  updated: number;
  skipped: number;
  listingsLinked: number;
  setsProcessed: number;
  cardsProcessed: number;
  bySet: Array<{
    tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ';
    setCode: string;
    setName: string;
    totalCards: number;
    created: number;
    updated: number;
    skipped: number;
    listingsLinked: number;
  }>;
}

export interface CatalogSyncResponse {
  dryRun: boolean;
  scannedSets: number;
  newSets: number;
  updatedSets: number;
  createdCards: number;
  updatedCards: number;
  skippedCards: number;
  bySet: Array<{
    tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ';
    setCode: string;
    setName: string;
    imported: boolean;
    reason: string;
    totalCards: number;
    created: number;
    updated: number;
    skipped: number;
  }>;
}

export interface EditionWithCounts extends Edition {
  tcg: { id: string; name: string; displayName: string };
  cardCount: number;
  listingCount: number;
}

export interface CardWithStock {
  id: string;
  cardCode: string;
  cardName: string;
  cardNumber?: string;
  rarity?: string;
  colorIdentity?: string;
  imageUrl?: string;
  tags?: string;
  listings: Array<{
    id: string;
    condition: string;
    quantity: number;
    referencePrice: number;
    marginMultiplier: number;
    finalPrice: number;
    currency: string;
    lastSyncedAt?: string;
    status: string;
  }>;
}

export interface EditionInventory {
  edition: Edition & { tcg: { id: string; name: string; displayName: string } };
  totalCards: number;
  cardsWithStock: number;
  cards: CardWithStock[];
}

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

// src/services/CardDatabaseService.ts
// Local-first card database facade.
// TCGCSV is the only active remote catalog/price source for the MVP.
// Legacy class names are retained as compatibility adapters so older routes/tests
// keep compiling, but every method delegates to TCGCsvService.

import { TCGCsvService } from './TCGCsvService.js';

export type SupportedTcg = 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ';

export type ExternalSource = 'scryfall' | 'pokemontcg' | 'ygoprodeck' | 'onepiecetcg' | 'tcgcsv';

export interface ExternalCard {
  externalId: string;
  source: ExternalSource;
  tcg: SupportedTcg;
  cardName: string;
  cardNumber?: string;
  editionCode: string;
  editionName: string;
  rarity?: string;
  colorIdentity?: string;
  imageUrl?: string;
  description?: string;
  tags?: string;
  cardType?: string;
  attribute?: string;
  metadata?: Record<string, any>;
  priceLow?: number;
  priceMid?: number;
  priceMarket?: number;
}

export interface ExternalEdition {
  code: string;
  name: string;
  releaseDate?: string;
  totalCards?: number;
  source: ExternalSource;
}

function mapSource<T extends ExternalCard | ExternalEdition>(items: T[], source: ExternalSource = 'tcgcsv'): T[] {
  return items.map((item) => ({ ...item, source }) as T);
}

abstract class TcgCsvCompatService {
  protected static readonly tcg: SupportedTcg;

  static async searchCards(query: string, page = 1): Promise<ExternalCard[]> {
    void page;
    return mapSource(await TCGCsvService.searchCards(this.tcg, query), 'tcgcsv');
  }

  static async getCardByName(name: string, setCode?: string): Promise<ExternalCard | null> {
    const cards = setCode
      ? await TCGCsvService.getSetCards(this.tcg, setCode)
      : await TCGCsvService.searchCards(this.tcg, name);
    const lowerName = name.trim().toLowerCase();
    const card = cards.find((candidate) => candidate.cardName.trim().toLowerCase() === lowerName) || null;
    return card ? ({ ...card, source: 'tcgcsv' } as ExternalCard) : null;
  }

  static async getCardById(cardId: string): Promise<ExternalCard | null> {
    const card = await TCGCsvService.getCardById(this.tcg, cardId);
    return card ? ({ ...card, source: 'tcgcsv' } as ExternalCard) : null;
  }

  static async getSetCards(setCode: string): Promise<ExternalCard[]> {
    return mapSource(await TCGCsvService.getSetCards(this.tcg, setCode), 'tcgcsv');
  }

  static async listSets(): Promise<ExternalEdition[]> {
    return mapSource(await TCGCsvService.listSets(this.tcg), 'tcgcsv');
  }
}

export class ScryfallService extends TcgCsvCompatService {
  protected static override readonly tcg = 'MAGIC' as const;
}

export class PokemonTCGService extends TcgCsvCompatService {
  protected static override readonly tcg = 'POKEMON' as const;
}

export class YGOProDeckService extends TcgCsvCompatService {
  protected static override readonly tcg = 'YUGIOH' as const;
}

export class OptcgapiService extends TcgCsvCompatService {
  protected static override readonly tcg = 'ONE_PIECE' as const;

  static async getAllCards(): Promise<ExternalCard[]> {
    const sets = await TCGCsvService.listSets('ONE_PIECE');
    const allCards: ExternalCard[] = [];

    for (const set of sets) {
      const cards = await TCGCsvService.getSetCards('ONE_PIECE', set.code);
      allCards.push(...mapSource(cards, 'tcgcsv'));
    }

    return allCards;
  }
}

export class CardDatabaseService {
  static async searchCards(
    tcg: SupportedTcg,
    query: string,
    options: { setCode?: string; page?: number } = {},
  ): Promise<ExternalCard[]> {
    void options.page;
    if (options.setCode) {
      const cards = await TCGCsvService.getSetCards(tcg, options.setCode);
      const lowerQuery = query.toLowerCase();
      return cards.filter((card) => card.cardName.toLowerCase().includes(lowerQuery));
    }

    return TCGCsvService.searchCards(tcg, query);
  }

  static async getCardById(tcg: SupportedTcg, cardId: string): Promise<ExternalCard | null> {
    return TCGCsvService.getCardById(tcg, cardId);
  }

  static async getSetCards(tcg: SupportedTcg, setCode: string): Promise<ExternalCard[]> {
    return TCGCsvService.getSetCards(tcg, setCode);
  }

  static async listSets(tcg: SupportedTcg): Promise<ExternalEdition[]> {
    return TCGCsvService.listSets(tcg);
  }

  static async getSetCardCount(tcg: SupportedTcg, setCode: string): Promise<number | null> {
    return TCGCsvService.getSetCardCount(tcg, setCode);
  }

  static async getSetPriceSnapshot(tcg: SupportedTcg, setCode: string): Promise<Record<string, number>> {
    return TCGCsvService.getSetPriceSnapshot(tcg, setCode);
  }
}

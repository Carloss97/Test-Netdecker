import { TCGCsvService, type TCGCsvTcg } from './TCGCsvService.js';

interface TcgplayerPriceResult {
  lowPrice?: number;
  midPrice?: number;
  marketPrice?: number;
  subTypeName?: string;
}

const TCGCSV_TCGS: TCGCsvTcg[] = ['MAGIC', 'POKEMON', 'YUGIOH', 'ONE_PIECE', 'DIGIMON', 'WEISS_SCHWARZ'];

function normalizeRarity(rarity?: string): string {
  return (rarity || '').trim().toLowerCase();
}

function selectPrice(price: TcgplayerPriceResult): number | null {
  const selected = price.marketPrice ?? price.midPrice ?? price.lowPrice;
  return typeof selected === 'number' && Number.isFinite(selected) ? selected : null;
}

export class TCGPlayerService {
  static isConfigured(): boolean {
    // Official TCGplayer API is intentionally disabled for local MVP development.
    // TCGCSV is the only active remote source.
    return false;
  }

  static async getProductPrices(productId: number): Promise<TcgplayerPriceResult[]> {
    for (const tcg of TCGCSV_TCGS) {
      const prices = await TCGCsvService.getProductPrices(tcg, productId);
      if (prices.length > 0) {
        return prices.map((price) => ({
          lowPrice: price.lowPrice ?? undefined,
          midPrice: price.midPrice ?? undefined,
          marketPrice: price.marketPrice ?? undefined,
          subTypeName: price.subTypeName,
        }));
      }
    }

    return [];
  }

  static async getMarketPriceByProduct(productId: number, rarity?: string): Promise<number | null> {
    const prices = await this.getProductPrices(productId);
    if (!prices.length) {
      return null;
    }

    const targetRarity = normalizeRarity(rarity);
    const matched = targetRarity
      ? prices.find((price) => normalizeRarity(price.subTypeName).includes(targetRarity))
      : undefined;

    return selectPrice(matched || prices[0]);
  }
}

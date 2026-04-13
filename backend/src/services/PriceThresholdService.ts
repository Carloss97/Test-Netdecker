import prisma from '../utils/db.js';

export class PriceThresholdService {
  /**
   * Get threshold percent for a specific listing by checking edition -> tcg -> default.
   */
  static async getThresholdForListing(listingId: string): Promise<number> {
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { editionId: true, card: { select: { tcg: { select: { name: true } } } } },
    });

    const tcgName = (listing?.card as any)?.tcg?.name ?? null;
    const editionId = listing?.editionId ?? null;
    return this.getThreshold(tcgName, editionId);
  }

  static async getThreshold(tcgName?: string | null, editionId?: string | null): Promise<number> {
    if (editionId) {
      const byEdition = await prisma.priceVolatilityThreshold.findFirst({ where: { editionId } });
      if (byEdition && typeof byEdition.thresholdPercent === 'number') return byEdition.thresholdPercent;
    }

    if (tcgName) {
      const byTcg = await prisma.priceVolatilityThreshold.findFirst({ where: { tcg: tcgName } });
      if (byTcg && typeof byTcg.thresholdPercent === 'number') return byTcg.thresholdPercent;
    }

    const envVal = Number(process.env.PRICE_VOLATILITY_THRESHOLD_DEFAULT ?? '10');
    return Number.isFinite(envVal) && envVal > 0 ? envVal : 10;
  }
}

export default PriceThresholdService;

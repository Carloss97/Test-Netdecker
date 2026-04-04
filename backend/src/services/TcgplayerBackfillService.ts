import prisma from '../utils/db.js';

interface BackfillOptions {
  limit?: number;
  offset?: number;
  dryRun?: boolean;
  tcg?: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE';
}

interface BackfillResultItem {
  cardId: string;
  cardName: string;
  cardCode: string;
  extractedProductId: number;
}

export interface BackfillResult {
  scanned: number;
  candidates: number;
  updated: number;
  skipped: number;
  dryRun: boolean;
  items: BackfillResultItem[];
}

function extractFromTags(tags?: string | null): number | null {
  if (!tags) return null;
  const match = tags.match(/(?:tcgplayer(?:ProductId)?|productId)[:=](\d+)/i);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function extractFromCardCode(cardCode: string): number | null {
  if (!/^\d+$/.test(cardCode)) return null;
  const parsed = Number.parseInt(cardCode, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export class TcgplayerBackfillService {
  static async backfillProductIds(options: BackfillOptions = {}): Promise<BackfillResult> {
    const limit = Math.max(1, Math.min(options.limit ?? 500, 5000));
    const offset = Math.max(0, options.offset ?? 0);
    const dryRun = options.dryRun === true;

    const cards = await prisma.card.findMany({
      where: {
        tcgplayerProductId: null,
        ...(options.tcg ? { tcg: { name: options.tcg } } : {}),
      },
      select: {
        id: true,
        cardName: true,
        cardCode: true,
        tags: true,
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      skip: offset,
    });

    const items: BackfillResultItem[] = [];
    let updated = 0;
    let skipped = 0;

    for (const card of cards) {
      const extracted = extractFromTags(card.tags) ?? extractFromCardCode(card.cardCode);
      if (!extracted) {
        skipped += 1;
        continue;
      }

      items.push({
        cardId: card.id,
        cardName: card.cardName,
        cardCode: card.cardCode,
        extractedProductId: extracted,
      });

      if (!dryRun) {
        await prisma.card.update({
          where: { id: card.id },
          data: { tcgplayerProductId: extracted },
        });
        updated += 1;
      }
    }

    return {
      scanned: cards.length,
      candidates: items.length,
      updated,
      skipped,
      dryRun,
      items,
    };
  }
}

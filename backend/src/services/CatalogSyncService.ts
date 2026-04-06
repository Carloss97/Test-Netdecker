import prisma from '../utils/db.js';
import { CardDatabaseService } from './CardDatabaseService.js';
import { ExternalImportService } from './ExternalImportService.js';
import { DEFAULT_MARGIN_MULTIPLIER, SUPPORTED_TCGS } from '../config/pricing.js';

export interface CatalogSyncOptions {
  tcg?: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ';
  dryRun?: boolean;
  createListings?: boolean;
  initialQuantity?: number;
  marginMultiplier?: number;
  concurrency?: number;
}

export interface CatalogSyncSetResult {
  tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ';
  setCode: string;
  setName: string;
  imported: boolean;
  reason: string;
  totalCards: number;
  created: number;
  updated: number;
  skipped: number;
}

export interface CatalogSyncResult {
  dryRun: boolean;
  scannedSets: number;
  newSets: number;
  updatedSets: number;
  createdCards: number;
  updatedCards: number;
  skippedCards: number;
  bySet: CatalogSyncSetResult[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class CatalogSyncService {
  static async syncNewSets(options: CatalogSyncOptions = {}): Promise<CatalogSyncResult> {
    const dryRun = options.dryRun === true;
    const selectedTcgs = options.tcg ? [options.tcg] : SUPPORTED_TCGS;

    const bySet: CatalogSyncSetResult[] = [];
    let scannedSets = 0;
    let newSets = 0;
    let updatedSets = 0;
    let createdCards = 0;
    let updatedCards = 0;
    let skippedCards = 0;

    for (const tcg of selectedTcgs) {
      const tcgRecord = await prisma.tCG.findFirst({ where: { name: tcg }, select: { id: true, displayName: true } });
      if (!tcgRecord) {
        continue;
      }

      const [externalSets, localEditions] = await Promise.all([
        CardDatabaseService.listSets(tcg),
        prisma.edition.findMany({
          where: { tcgId: tcgRecord.id },
          select: { editionCode: true, editionName: true },
        }),
      ]);

      const localByCode = new Map(localEditions.map((edition) => [edition.editionCode.toUpperCase(), edition] as const));

      for (const externalSet of externalSets) {
        scannedSets += 1;
        const editionCode = externalSet.code.toUpperCase();
        const localEdition = localByCode.get(editionCode);
        const reason = localEdition ? 'already_present' : 'new_set';

        if (localEdition && !dryRun) {
          updatedSets += 1;
          await prisma.edition.updateMany({
            where: {
              tcgId: tcgRecord.id,
              editionCode,
            },
            data: {
              editionName: externalSet.name,
              isActive: true,
              releaseDate: externalSet.releaseDate ? new Date(externalSet.releaseDate) : undefined,
            },
          });
        }

        if (!localEdition) {
          newSets += 1;
          if (!dryRun) {
            const cards = await CardDatabaseService.getSetCards(tcg, editionCode);
            const importResult = await ExternalImportService.bulkImportCards(cards, {
              createListing: options.createListings !== false,
              quantity: options.initialQuantity ?? 0,
              marginMultiplier: options.marginMultiplier ?? DEFAULT_MARGIN_MULTIPLIER,
              concurrency: options.concurrency ?? 4,
            });

            createdCards += importResult.created;
            updatedCards += importResult.updated;
            skippedCards += importResult.skipped;
            bySet.push({
              tcg,
              setCode: editionCode,
              setName: externalSet.name,
              imported: true,
              reason,
              totalCards: cards.length,
              created: importResult.created,
              updated: importResult.updated,
              skipped: importResult.skipped,
            });

            // Rate limit: add delay between set imports to avoid overwhelming external APIs
            await sleep(500);
          } else {
            bySet.push({
              tcg,
              setCode: editionCode,
              setName: externalSet.name,
              imported: true,
              reason,
              totalCards: externalSet.totalCards ?? 0,
              created: 0,
              updated: 0,
              skipped: 0,
            });
          }
        }
      }
    }

    return {
      dryRun,
      scannedSets,
      newSets,
      updatedSets,
      createdCards,
      updatedCards,
      skippedCards,
      bySet,
    };
  }
}

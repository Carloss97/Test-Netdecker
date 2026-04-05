import { CardDatabaseService } from './CardDatabaseService.js';
import { ExternalImportService } from './ExternalImportService.js';

export interface CatalogBootstrapOptions {
  tcg?: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ';
  setCode?: string;
  setLimit?: number;
  dryRun?: boolean;
  createListings?: boolean;
  initialQuantity?: number;
  marginMultiplier?: number;
}

export interface CatalogBootstrapSetResult {
  tcg: 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ';
  setCode: string;
  setName: string;
  totalCards: number;
  created: number;
  updated: number;
  skipped: number;
  listingsLinked: number;
}

export interface CatalogBootstrapResult {
  dryRun: boolean;
  created: number;
  updated: number;
  skipped: number;
  listingsLinked: number;
  setsProcessed: number;
  cardsProcessed: number;
  bySet: CatalogBootstrapSetResult[];
}

const SUPPORTED_TCGS: Array<'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ'> = [
  'MAGIC', 'POKEMON', 'YUGIOH', 'ONE_PIECE', 'DIGIMON', 'WEISS_SCHWARZ',
];

function normalizeSetCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export class CatalogBootstrapService {
  static async bootstrapCatalog(options: CatalogBootstrapOptions = {}): Promise<CatalogBootstrapResult> {
    const dryRun = options.dryRun === true;
    const createListings = options.createListings !== false;
    const initialQuantity = options.initialQuantity ?? 0;
    const marginMultiplier = options.marginMultiplier ?? 1.2;
    const selectedTcgs = options.tcg ? [options.tcg] : SUPPORTED_TCGS;

    const bySet: CatalogBootstrapSetResult[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let listingsLinked = 0;
    let setsProcessed = 0;
    let cardsProcessed = 0;

    for (const tcg of selectedTcgs) {
      const sets = options.setCode
        ? [{ code: normalizeSetCode(options.setCode), name: normalizeSetCode(options.setCode), totalCards: undefined }]
        : await CardDatabaseService.listSets(tcg);

      const limitedSets = typeof options.setLimit === 'number' ? sets.slice(0, Math.max(0, options.setLimit)) : sets;

      for (const set of limitedSets) {
        const setCode = normalizeSetCode(set.code);
        const cards = await CardDatabaseService.getSetCards(tcg, setCode);
        const bootstrapResult = await ExternalImportService.bulkImportCards(cards, {
          createListing: createListings,
          quantity: initialQuantity,
          marginMultiplier,
        });

        const setSummary: CatalogBootstrapSetResult = {
          tcg,
          setCode,
          setName: set.name,
          totalCards: cards.length,
          created: bootstrapResult.created,
          updated: bootstrapResult.updated,
          skipped: bootstrapResult.skipped,
          listingsLinked: bootstrapResult.results.filter((result) => Boolean(result.listingId)).length,
        };

        bySet.push(setSummary);
        created += bootstrapResult.created;
        updated += bootstrapResult.updated;
        skipped += bootstrapResult.skipped;
        listingsLinked += setSummary.listingsLinked;
        setsProcessed += 1;
        cardsProcessed += cards.length;
      }
    }

    return {
      dryRun,
      created,
      updated,
      skipped,
      listingsLinked,
      setsProcessed,
      cardsProcessed,
      bySet,
    };
  }
}

// src/routes/external.routes.ts
// Routes for searching and importing cards from external TCG databases.

import express, { Request, Response } from 'express';
import { CardDatabaseService } from '../services/CardDatabaseService.js';
import { ExternalImportService } from '../services/ExternalImportService.js';
import { isImportSetSyncPricesDefault } from '../config/appConfig.js';
import { CardCondition } from '@prisma/client';
import { ValidationError, NotFoundError } from '../utils/errors.js';

const router = express.Router();

type TCGParam = 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ';
const VALID_TCGS: TCGParam[] = ['MAGIC', 'POKEMON', 'YUGIOH', 'ONE_PIECE', 'DIGIMON', 'WEISS_SCHWARZ'];

function parseTCG(raw: unknown): TCGParam | null {
  const upper = String(raw || '').toUpperCase().replace(/[- ]/g, '_') as TCGParam;
  return VALID_TCGS.includes(upper) ? upper : null;
}

/**
 * GET /api/external/search?tcg=MAGIC&query=Lightning+Bolt&setCode=...&page=1
 * Search cards in external database without importing them.
 */
router.get('/search', async (req: Request, res: Response) => {
  const tcg = parseTCG(req.query.tcg);
  if (!tcg) throw new ValidationError('tcg must be one of: MAGIC, POKEMON, YUGIOH, ONE_PIECE, DIGIMON, WEISS_SCHWARZ');

  const query = String(req.query.query || req.query.name || '').trim();
  if (!query) throw new ValidationError('query (or name) parameter is required');

  const setCode = req.query.setCode ? String(req.query.setCode) : undefined;
  const page = parseInt(String(req.query.page || '1'), 10) || 1;

  const cards = await CardDatabaseService.searchCards(tcg, query, { setCode, page });
  res.json({ success: true, tcg, query, total: cards.length, cards });
});

/**
 * GET /api/external/sets?tcg=MAGIC
 * List available editions/sets from the external database.
 */
router.get('/sets', async (req: Request, res: Response) => {
  const tcg = parseTCG(req.query.tcg);
  if (!tcg) throw new ValidationError('tcg must be one of: MAGIC, POKEMON, YUGIOH, ONE_PIECE, DIGIMON, WEISS_SCHWARZ');

  const sets = await CardDatabaseService.listSets(tcg);
  const enrichedSets = await Promise.all(
    sets.map(async (set) => ({
      ...set,
      totalCards: typeof set.totalCards === 'number' && set.totalCards > 0
        ? set.totalCards
        : await CardDatabaseService.getSetCardCount(tcg, set.code),
    }))
  );

  res.json({ success: true, tcg, total: enrichedSets.length, sets: enrichedSets });
});

/**
 * GET /api/external/cards/:tcg/:cardId
 * Fetch a single card from the external database by its ID.
 */
router.get('/cards/:tcg/:cardId', async (req: Request, res: Response) => {
  const tcg = parseTCG(req.params.tcg);
  if (!tcg) throw new ValidationError('tcg must be one of: MAGIC, POKEMON, YUGIOH, ONE_PIECE, DIGIMON, WEISS_SCHWARZ');

  const card = await CardDatabaseService.getCardById(tcg, req.params.cardId);
  if (!card) throw new NotFoundError('Card not found in external database');
  res.json({ success: true, card });
});

/**
 * POST /api/external/import/card
 * Import a single card from an external database into the local DB.
 * Body: { tcg, cardId, createListing?, referencePrice?, marginMultiplier?, quantity?, condition? }
 */
router.post('/import/card', async (req: Request, res: Response) => {
  const tcg = parseTCG(req.body.tcg);
  if (!tcg) throw new ValidationError('tcg must be one of: MAGIC, POKEMON, YUGIOH, ONE_PIECE, DIGIMON, WEISS_SCHWARZ');

  const cardId = String(req.body.cardId || '').trim();
  if (!cardId) throw new ValidationError('cardId is required');

  const externalCard = await CardDatabaseService.getCardById(tcg, cardId);
  if (!externalCard) throw new NotFoundError('Card not found in external database');

  const VALID_CONDITIONS: CardCondition[] = ['NM', 'LP', 'MP', 'HP', 'DMG'];
  const rawCondition = req.body.condition ? String(req.body.condition).toUpperCase() : undefined;
  const condition = rawCondition && VALID_CONDITIONS.includes(rawCondition as CardCondition)
    ? (rawCondition as CardCondition)
    : undefined;

  const result = await ExternalImportService.importCard(externalCard, {
    createListing: req.body.createListing === true || req.body.createListing === 'true',
    referencePrice: req.body.referencePrice ? parseFloat(req.body.referencePrice) : undefined,
    marginMultiplier: req.body.marginMultiplier ? parseFloat(req.body.marginMultiplier) : undefined,
    quantity: req.body.quantity ? parseInt(req.body.quantity, 10) : undefined,
    condition,
  });

  res.json({ success: true, result });
});

/**
 * POST /api/external/import/search
 * Search external DB and import matching cards.
 * Body: { tcg, query, setCode?, page?, createListing?, referencePrice?, marginMultiplier? }
 */
router.post('/import/search', async (req: Request, res: Response) => {
  const tcg = parseTCG(req.body.tcg);
  if (!tcg) throw new ValidationError('tcg must be one of: MAGIC, POKEMON, YUGIOH, ONE_PIECE, DIGIMON, WEISS_SCHWARZ');

  const query = String(req.body.query || req.body.name || '').trim();
  if (!query) throw new ValidationError('query (or name) parameter is required');

  const result = await ExternalImportService.searchAndImport(tcg, query, {
    setCode: req.body.setCode,
    page: req.body.page ? parseInt(req.body.page, 10) : undefined,
    createListing: req.body.createListing === true || req.body.createListing === 'true',
    referencePrice: req.body.referencePrice ? parseFloat(req.body.referencePrice) : undefined,
    marginMultiplier: req.body.marginMultiplier ? parseFloat(req.body.marginMultiplier) : undefined,
    quantity: req.body.quantity ? parseInt(req.body.quantity, 10) : undefined,
  });

  res.json({ success: true, ...result });
});

/**
 * POST /api/external/import/set
 * Import all cards from a set/edition from the external database.
 * Body: { tcg, setCode, createListing?, marginMultiplier? }
 */
router.post('/import/set', async (req: Request, res: Response) => {
  const tcg = parseTCG(req.body.tcg);
  if (!tcg) throw new ValidationError('tcg must be one of: MAGIC, POKEMON, YUGIOH, ONE_PIECE, DIGIMON, WEISS_SCHWARZ');

  const setCode = String(req.body.setCode || '').trim();
  if (!setCode) throw new ValidationError('setCode is required');

  const syncPrices = req.body.syncPrices === undefined
    ? isImportSetSyncPricesDefault()
    : (req.body.syncPrices === true || req.body.syncPrices === 'true');

  const result = await ExternalImportService.importSet(tcg, setCode, {
    createListing: req.body.createListing === true || req.body.createListing === 'true',
    marginMultiplier: req.body.marginMultiplier ? parseFloat(req.body.marginMultiplier) : undefined,
    syncPrices,
  });

  res.json({ success: true, ...result });
});

/**
 * GET /api/external/ygoprodeck/card-sets
 * Browse all Yu-Gi-Oh card sets sourced from TCGCSV.
 */
router.get('/ygoprodeck/card-sets', async (req: Request, res: Response) => {
  const sets = await CardDatabaseService.listSets('YUGIOH');
  res.json({ success: true, source: 'tcgcsv', total: sets.length, sets });
});

/**
 * GET /api/external/optcgapi/cards
 * Browse all One Piece cards sourced from TCGCSV.
 * Optional query params: limit (default: 100), offset (default: 0)
 */
router.get('/optcgapi/cards', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(String(req.query.limit || '100'), 10) || 100, 500);
  const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0);

  const allCards = await CardDatabaseService.listSets('ONE_PIECE').then(async (sets) => {
    const cards: Array<{
      externalId: string;
      source: string;
      tcg: string;
      cardName: string;
      editionCode: string;
      editionName: string;
      rarity?: string;
      imageUrl?: string;
      priceLow?: number;
      priceMarket?: number;
    }> = [];
    for (const set of sets) {
      const setCards = await CardDatabaseService.getSetCards('ONE_PIECE', set.code);
      cards.push(...setCards);
    }
    return cards;
  });

  const paginated = allCards.slice(offset, offset + limit);
  res.json({
    success: true,
    source: 'tcgcsv',
    total: allCards.length,
    limit,
    offset,
    returned: paginated.length,
    cards: paginated,
  });
});

/**
 * POST /api/external/optcgapi/import/bulk
 * Import ALL One Piece cards in bulk from TCGCSV.
 * Body: { createListing?, marginMultiplier?, quantity?, condition? }
 */
router.post('/optcgapi/import/bulk', async (req: Request, res: Response) => {
  const sets = await CardDatabaseService.listSets('ONE_PIECE');
  const allCards: Awaited<ReturnType<typeof CardDatabaseService.getSetCards>> = [];

  for (const set of sets) {
    const setCards = await CardDatabaseService.getSetCards('ONE_PIECE', set.code);
    allCards.push(...setCards);
  }

  if (allCards.length === 0) throw new NotFoundError('No One Piece cards found in OPTCGAPI');

  const result = await ExternalImportService.bulkImportCards(allCards, {
    createListing: req.body.createListing === true || req.body.createListing === 'true',
    marginMultiplier: req.body.marginMultiplier ? parseFloat(req.body.marginMultiplier) : undefined,
    quantity: req.body.quantity ? parseInt(req.body.quantity, 10) : undefined,
    condition: req.body.condition ? (req.body.condition as CardCondition) : undefined,
  });

  res.json({
    success: true,
    source: 'tcgcsv',
    tcg: 'ONE_PIECE',
    totalCards: allCards.length,
    ...result,
  });
});

export default router;

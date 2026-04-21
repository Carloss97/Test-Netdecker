// src/routes/card.routes.ts
import express, { Request, Response } from 'express';
import { CardService } from '../services/CardService.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

const router = express.Router();

/**
 * GET /api/cards/search?name=xxx or /api/cards/search?code=xxx
 * Search cards by name or by card code
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { name, code, tcgId, limit } = req.query;

    if (!name && !code) {
      throw new ValidationError('name or code query parameter is required');
    }

    if (code) {
      console.debug('[card.routes] search by code', { code: String(code).slice(0, 80), tcgId, limit });
      const cards = await CardService.searchByCode(
        code as string,
        tcgId as string | undefined,
        parseInt(limit as string) || 50,
      );
      res.json(cards);
      return;
    }

    console.debug('[card.routes] search by name', { name: String(name).slice(0, 80), tcgId, limit });
    const cards = await CardService.searchByName(
      name as string,
      tcgId as string | undefined,
      parseInt(limit as string) || 20,
    );

    res.json(cards);
  } catch (err) {
    try {
      console.error('[card.routes] /api/cards/search error', { path: req.path, query: req.query, error: (err as any)?.message || err });
    } catch (_) {}
    throw err;
  }
});

/**
 * GET /api/cards/edition/:editionId
 * Get cards by edition
 */
router.get('/edition/:editionId', async (req: Request, res: Response) => {
  const cards = await CardService.getCardsByEdition(req.params.editionId);
  res.json(cards);
});

/**
 * GET /api/cards/tcg/:tcgId
 * Get cards by TCG
 */
router.get('/tcg/:tcgId', async (req: Request, res: Response) => {
  const cards = await CardService.getCardsByTCG(req.params.tcgId);
  res.json(cards);
});

/**
 * GET /api/cards/:id
 * Get card by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  const card = await CardService.getCard(req.params.id);
  if (!card) {
    throw new NotFoundError('Card not found');
  }
  res.json(card);
});

export default router;

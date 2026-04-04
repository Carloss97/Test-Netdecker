// src/routes/card.routes.ts
import express, { Request, Response } from 'express';
import { CardService } from '../services/CardService.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

const router = express.Router();

/**
 * GET /api/cards/search?name=xxx
 * Search cards by name
 */
router.get('/search', async (req: Request, res: Response) => {
  const { name, tcgId, limit } = req.query;

  if (!name) {
    throw new ValidationError('name query parameter is required');
  }

  const cards = await CardService.searchByName(
    name as string,
    tcgId as string | undefined,
    parseInt(limit as string) || 20
  );

  res.json(cards);
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

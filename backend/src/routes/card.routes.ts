// src/routes/card.routes.ts
import express, { Request, Response } from 'express';
import { CardService } from '../services/CardService.js';

const router = express.Router();

/**
 * GET /api/cards/search?name=xxx
 * Search cards by name
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { name, tcgId, limit } = req.query;
    
    if (!name) {
      return res.status(400).json({ error: 'name query parameter is required' });
    }

    const cards = await CardService.searchByName(
      name as string,
      tcgId as string | undefined,
      parseInt(limit as string) || 20
    );
    
    res.json(cards);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/cards/edition/:editionId
 * Get cards by edition
 */
router.get('/edition/:editionId', async (req: Request, res: Response) => {
  try {
    const cards = await CardService.getCardsByEdition(req.params.editionId);
    res.json(cards);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/cards/tcg/:tcgId
 * Get cards by TCG
 */
router.get('/tcg/:tcgId', async (req: Request, res: Response) => {
  try {
    const cards = await CardService.getCardsByTCG(req.params.tcgId);
    res.json(cards);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/cards/:id
 * Get card by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const card = await CardService.getCard(req.params.id);
    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }
    res.json(card);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;

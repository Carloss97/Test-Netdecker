// src/routes/tcg.routes.ts
import express, { Request, Response } from 'express';
import { TCGService } from '../services/TCGService.js';

const router = express.Router();

/**
 * GET /api/tcgs
 * Get all TCGs
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const tcgs = await TCGService.getAllTCGs();
    res.json(tcgs);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/tcgs/:id
 * Get TCG by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const tcg = await TCGService.getTCGById(req.params.id);
    if (!tcg) {
      return res.status(404).json({ error: 'TCG not found' });
    }
    res.json(tcg);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;

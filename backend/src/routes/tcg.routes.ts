// src/routes/tcg.routes.ts
import express, { Request, Response } from 'express';
import { TCGService } from '../services/TCGService.js';
import { NotFoundError } from '../utils/errors.js';

const router = express.Router();

/**
 * GET /api/tcgs
 * Get all TCGs
 */
router.get('/', async (_req: Request, res: Response) => {
  const tcgs = await TCGService.getAllTCGs();
  res.json(tcgs);
});

/**
 * GET /api/tcgs/:id
 * Get TCG by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  const tcg = await TCGService.getTCGById(req.params.id);
  if (!tcg) {
    throw new NotFoundError('TCG not found');
  }
  res.json(tcg);
});

export default router;

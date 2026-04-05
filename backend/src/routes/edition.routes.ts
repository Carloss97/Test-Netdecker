// src/routes/edition.routes.ts
import express, { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../utils/db.js';
import { NotFoundError } from '../utils/errors.js';

const router = express.Router();

const CSV_TEMPLATE_HEADER = ['listingId', 'cardCode', 'cardName', 'cardNumber', 'rarity', 'condition', 'quantity', 'referencePrice'];

/**
 * GET /api/editions
 * List all editions with optional filters.
 * Query params: tcgId (string), activeOnly (boolean, default true)
 */
router.get('/', async (req: Request, res: Response) => {
  const { tcgId, activeOnly } = req.query;
  const filterActive = activeOnly !== 'false';

  const where: Prisma.EditionWhereInput = {};
  if (tcgId) where.tcgId = tcgId as string;
  if (filterActive) where.isActive = true;

  const editions = await prisma.edition.findMany({
    where,
    include: {
      tcg: { select: { id: true, name: true, displayName: true } },
      _count: {
        select: { cards: true, listings: true },
      },
    },
    orderBy: { releaseDate: 'desc' },
  });

  const result = editions.map((e) => ({
    id: e.id,
    editionCode: e.editionCode,
    editionName: e.editionName,
    releaseDate: e.releaseDate,
    isActive: e.isActive,
    tcgId: e.tcgId,
    tcg: e.tcg,
    cardCount: e._count.cards,
    listingCount: e._count.listings,
  }));

  res.json(result);
});

/**
 * GET /api/editions/:id
 * Get a single edition by ID with TCG info.
 */
router.get('/:id', async (req: Request, res: Response) => {
  const edition = await prisma.edition.findUnique({
    where: { id: req.params.id },
    include: {
      tcg: { select: { id: true, name: true, displayName: true } },
      _count: { select: { cards: true, listings: true } },
    },
  });

  if (!edition) {
    throw new NotFoundError('Edition not found');
  }

  res.json({
    id: edition.id,
    editionCode: edition.editionCode,
    editionName: edition.editionName,
    releaseDate: edition.releaseDate,
    isActive: edition.isActive,
    tcgId: edition.tcgId,
    tcg: edition.tcg,
    cardCount: edition._count.cards,
    listingCount: edition._count.listings,
  });
});

/**
 * GET /api/editions/:id/cards-with-stock
 * Returns all cards in this edition with their associated listings (if any).
 * Key endpoint for the inventory management workflow.
 */
router.get('/:id/cards-with-stock', async (req: Request, res: Response) => {
  const edition = await prisma.edition.findUnique({
    where: { id: req.params.id },
    include: {
      tcg: { select: { id: true, name: true, displayName: true } },
    },
  });

  if (!edition) {
    throw new NotFoundError('Edition not found');
  }

  const cards = await prisma.card.findMany({
    where: { editionId: req.params.id },
    include: {
      listings: {
        select: {
          id: true,
          condition: true,
          quantity: true,
          referencePrice: true,
          marginMultiplier: true,
          finalPrice: true,
          currency: true,
          lastSyncedAt: true,
          status: true,
        },
      },
    },
    orderBy: [{ cardNumber: 'asc' }, { cardName: 'asc' }],
  });

  // Ensure each card has at least one listing. If not, create one.
  for (const card of cards) {
    if (card.listings.length === 0) {
      const newListing = await prisma.listing.create({
        data: {
          cardId: card.id,
          editionId: edition.id,
          condition: 'NM',
          rarity: card.rarity,
          quantity: 0,
          referencePrice: 0,
          marginMultiplier: 1.2,
          exchangeRate: 1.0,
          finalPrice: 0,
          currency: 'CLP',
          status: 'active',
        },
        select: {
          id: true,
          condition: true,
          quantity: true,
          referencePrice: true,
          marginMultiplier: true,
          finalPrice: true,
          currency: true,
          lastSyncedAt: true,
          status: true,
        },
      });
      card.listings.push(newListing);
    }
  }

  const cardsWithStock = cards.filter((c) => c.listings.some((l) => l.quantity > 0)).length;

  res.json({
    edition: {
      id: edition.id,
      editionCode: edition.editionCode,
      editionName: edition.editionName,
      releaseDate: edition.releaseDate,
      tcgId: edition.tcgId,
      tcg: edition.tcg,
    },
    totalCards: cards.length,
    cardsWithStock,
    cards: cards.map((c) => ({
      id: c.id,
      cardCode: c.cardCode,
      cardName: c.cardName,
      cardNumber: c.cardNumber,
      rarity: c.rarity,
      colorIdentity: c.colorIdentity,
      imageUrl: c.imageUrl,
      tags: c.tags,
      listings: c.listings,
    })),
  });
});

/**
 * GET /api/editions/:id/csv-template
 * Download CSV template pre-filled with all cards in this edition.
 * Cards with existing listings include listingId and current values.
 * Cards without listings have card info only.
 */
router.get('/:id/csv-template', async (req: Request, res: Response) => {
  const edition = await prisma.edition.findUnique({
    where: { id: req.params.id },
    select: { id: true, editionCode: true, editionName: true },
  });

  if (!edition) {
    throw new NotFoundError('Edition not found');
  }

  const cards = await prisma.card.findMany({
    where: { editionId: req.params.id },
    include: {
      listings: {
        select: {
          id: true,
          condition: true,
          quantity: true,
          referencePrice: true,
        },
      },
    },
    orderBy: [{ cardNumber: 'asc' }, { cardName: 'asc' }],
  });

  const header = CSV_TEMPLATE_HEADER;

  const rows: string[][] = [];
  for (const card of cards) {
    if (card.listings.length > 0) {
      for (const listing of card.listings) {
        rows.push([
          listing.id,
          card.cardCode,
          card.cardName,
          card.cardNumber ?? '',
          card.rarity ?? '',
          listing.condition,
          String(listing.quantity),
          String(listing.referencePrice),
        ]);
      }
    } else {
      rows.push([
        '',
        card.cardCode,
        card.cardName,
        card.cardNumber ?? '',
        card.rarity ?? '',
        '',
        '',
        '',
      ]);
    }
  }

  const csv = [header, ...rows]
    .map((cols) => cols.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  const filename = `${edition.editionCode}-inventory-template.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

export default router;

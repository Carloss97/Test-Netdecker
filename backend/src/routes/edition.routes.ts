// src/routes/edition.routes.ts
import express, { Request, Response } from 'express';
import { Prisma, TCGType } from '@prisma/client';
import prisma from '../utils/db.js';
import { NotFoundError } from '../utils/errors.js';
import { DEFAULT_MARGIN_MULTIPLIER } from '../config/pricing.js';

const router = express.Router();

const CSV_TEMPLATE_HEADER = ['listingId', 'cardCode', 'cardName', 'cardNumber', 'rarity', 'condition', 'quantity', 'referencePrice'];

type ListingSummary = {
  id: string;
  condition: string;
  quantity: number;
  referencePrice: number;
  marginMultiplier?: number;
  finalPrice?: number;
  currency?: string;
  lastSyncedAt?: Date | null;
  status?: string;
};

type CardWithListings = {
  id: string;
  cardCode: string;
  cardName: string;
  cardNumber?: string | null;
  rarity?: string | null;
  colorIdentity?: string | null;
  imageUrl?: string | null;
  tags?: string | null;
  listings: ListingSummary[];
};

const TCG_NAME_ALIASES: Record<string, TCGType> = {
  MAGIC: 'MAGIC',
  MTG: 'MAGIC',
  POKEMON: 'POKEMON',
  YUGIOH: 'YUGIOH',
  YU_GI_OH: 'YUGIOH',
  ONEPIECE: 'ONE_PIECE',
  ONE_PIECE: 'ONE_PIECE',
  DIGIMON: 'DIGIMON',
  WEISS: 'WEISS_SCHWARZ',
  WEISS_SCHWARZ: 'WEISS_SCHWARZ',
};

function normalizeTcgNameToken(raw: string): TCGType | null {
  const token = String(raw || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();

  if (!token) {
    return null;
  }

  return TCG_NAME_ALIASES[token] ?? null;
}

/**
 * GET /api/editions
 * List all editions with optional filters.
 * Query params: tcgId (string), activeOnly (boolean, default true)
 */
router.get('/', async (req: Request, res: Response) => {
  const { tcgId, activeOnly } = req.query;
  const filterActive = activeOnly !== 'false';

  const where: Prisma.EditionWhereInput = {};

  if (tcgId) {
    const rawTcgFilter = String(tcgId).trim();
    
    // Check if it's a valid CUID-like ID first
    if (rawTcgFilter.length > 20) {
       where.tcgId = rawTcgFilter;
    } else {
      const normalizedName = normalizeTcgNameToken(rawTcgFilter);
      if (normalizedName) {
        const resolvedTcg = await prisma.tCG.findUnique({
          where: { name: normalizedName },
          select: { id: true },
        });
        where.tcgId = resolvedTcg?.id ?? rawTcgFilter;
      } else {
        where.tcgId = rawTcgFilter;
      }
    }
  }

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

  type EditionRow = {
    id: string;
    editionCode: string;
    editionName: string;
    releaseDate?: string | Date | null;
    isActive: boolean;
    tcg: { id: string; name: string; displayName?: string };
    _count: { cards: number; listings: number };
  };

  const result = editions.map((e: EditionRow) => ({
    id: e.id,
    editionCode: e.editionCode,
    editionName: e.editionName,
    releaseDate: e.releaseDate,
    isActive: e.isActive,
    tcgId: e.tcg.id,
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
 * PATCH /api/editions/:id/status
 * Enable/Disable Edition
 */
router.patch('/:id/status', async (req: Request, res: Response) => {
  const { isActive } = req.body;
  const updated = await prisma.edition.update({
    where: { id: req.params.id },
    data: { isActive: Boolean(isActive) }
  });
  res.json({ success: true, edition: updated });
});

/**
 * GET /api/editions/:id/cards-with-stock
 * Returns all cards in this edition with their associated listings (if any).
 * Key endpoint for the inventory management workflow.
 */
router.get('/:id/cards-with-stock', async (req: Request, res: Response) => {
  const idOrCode = String(req.params.id || '').trim();

  let edition = await prisma.edition.findUnique({
    where: { id: idOrCode },
    include: {
      tcg: { select: { id: true, name: true, displayName: true } },
    },
  });

  if (!edition) {
    edition = await prisma.edition.findFirst({
      where: {
        OR: [
          { editionCode: idOrCode },
          { editionCode: idOrCode.toUpperCase() },
        ],
      },
      include: {
        tcg: { select: { id: true, name: true, displayName: true } },
      },
      orderBy: { releaseDate: 'desc' },
    });
  }

  if (!edition) {
    throw new NotFoundError('Edition not found');
  }

  const cards = await prisma.card.findMany({
    where: { editionId: edition.id },
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

  // If a store exists, ensure each card has at least one listing.
  // Otherwise, return the inventory view without mutating data.
  const resolvedStoreId = req.store?.id ?? (await prisma.store.findFirst({
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  }))?.id;

  if (resolvedStoreId) {
    for (const card of cards as CardWithListings[]) {
      if (card.listings.length === 0) {
        try {
          const newListing = await prisma.listing.create({
            data: {
              storeId: resolvedStoreId,
              cardId: card.id,
              editionId: edition.id,
              condition: 'NM',
              rarity: card.rarity ?? 'Unknown',
              quantity: 0,
              referencePrice: 0,
              marginMultiplier: DEFAULT_MARGIN_MULTIPLIER,
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
        } catch (e) {
          try {
            console.error('[edition.routes] failed creating listing', { editionId: edition.id, cardId: card.id, cardCode: card.cardCode, err: (e as any)?.message || e });
          } catch (_) {}
          throw e;
        }
      }
    }
  }

  const cardsWithStock = cards.filter((c: CardWithListings) => c.listings.some((l: ListingSummary) => l.quantity > 0)).length;

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
    cards: cards.map((c: CardWithListings) => ({
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
  for (const card of cards as CardWithListings[]) {
    if (card.listings.length > 0) {
      for (const listing of card.listings as ListingSummary[]) {
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
    .map((cols: string[]) => cols.map((v: string) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  const filename = `${edition.editionCode}-inventory-template.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

export default router;

// backend/src/controllers/ListingController.ts
import { Request, Response } from 'express';
import { ListingService } from '../services/ListingService.js';
import { PriceService } from '../services/PriceService.js';
import { CardService } from '../services/CardService.js';
import { isValidCardCondition, isValidQuantity, isValidPrice } from '../utils/validators.js';
import { ValidationError } from '../utils/errors.js';
import { resolveMarginMultiplier } from '../config/pricing.js';

function getActorFromRequest(req: Request): string {
  const fromHeader = req.header('x-admin-user') || req.header('x-user-id');
  const fromBody = typeof req.body?.updatedBy === 'string' ? req.body.updatedBy : undefined;
  return (fromHeader || fromBody || 'system:admin').trim();
}

export class ListingController {
  /**
   * POST /api/admin/listings
   * Create a new listing
   */
  static async createListing(req: Request, res: Response) {
    try {
      const { cardId, condition, quantity, referencePrice, marginMultiplier, costPrice } = req.body;

      // Validate
      if (!cardId || !condition || quantity === undefined || !referencePrice) {
        throw new ValidationError('Missing required fields: cardId, condition, quantity, referencePrice');
      }

      if (!isValidCardCondition(condition)) {
        throw new ValidationError('Invalid card condition');
      }

      if (!isValidQuantity(quantity)) {
        throw new ValidationError('Quantity must be a non-negative integer');
      }

      if (!isValidPrice(referencePrice)) {
        throw new ValidationError('Reference price must be a positive number');
      }

      // Verify card exists
      const card = await CardService.getCard(cardId);
      if (!card) {
        throw new ValidationError(`Card not found: ${cardId}`);
      }

      // Create listing
      const listing = await ListingService.createListing({
        cardId,
        condition,
        quantity,
        referencePrice,
        marginMultiplier: resolveMarginMultiplier(marginMultiplier),
        costPrice
      });

      res.status(201).json({
        success: true,
        data: listing
      });
    } catch (error: unknown) {
      if (error instanceof ValidationError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }

      const getStatusCodeFromUnknown = (e: unknown): number | undefined => {
        if (typeof e === 'object' && e !== null) {
          const maybe = e as Record<string, unknown>;
          if (typeof maybe.statusCode === 'number') return maybe.statusCode;
        }
        return undefined;
      };

      const message = error instanceof Error ? error.message : 'Internal Server Error';
      const statusCode = getStatusCodeFromUnknown(error) ?? 500;
      res.status(statusCode).json({ error: message });
    }
  }

  /**
   * PATCH /api/admin/listings/:id/price
   * Update listing price and margin
   */
  static async updatePrice(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { referencePrice, marginMultiplier, notes } = req.body;

      if (!referencePrice) {
        throw new ValidationError('referencePrice is required');
      }

      if (!isValidPrice(referencePrice)) {
        throw new ValidationError('Reference price must be a positive number');
      }

      const listing = await ListingService.getListing(id);
      if (!listing) {
        throw new ValidationError(`Listing not found: ${id}`);
      }

      // Check for volatile changes
      const nextMargin = resolveMarginMultiplier(
        typeof marginMultiplier === 'number' ? marginMultiplier : listing.marginMultiplier,
      );

      const newPrice = await PriceService.calculateFinalPrice({
        referencePrice,
        marginMultiplier: nextMargin,
      });

      const isVolatile = PriceService.isVolatileChange(
        listing.finalPrice,
        newPrice.finalPrice
      );

      if (isVolatile) {
        console.warn(`⚠️ Volatile price change detected for listing ${id}`);
      }

      // Update price
      await PriceService.updateListingPrice(
        id,
        referencePrice,
        nextMargin,
        'MANUAL_UPDATE',
        getActorFromRequest(req),
        notes
      );

      res.json({
        success: true,
        message: 'Price updated',
        volatile: isVolatile
      });
    } catch (error: unknown) {
      if (error instanceof ValidationError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }

      const getStatusCodeFromUnknown = (e: unknown): number | undefined => {
        if (typeof e === 'object' && e !== null) {
          const maybe = e as Record<string, unknown>;
          if (typeof maybe.statusCode === 'number') return maybe.statusCode;
        }
        return undefined;
      };

      const message = error instanceof Error ? error.message : 'Internal Server Error';
      const statusCode = getStatusCodeFromUnknown(error) ?? 500;
      res.status(statusCode).json({ error: message });
    }
  }
}

// backend/src/controllers/ListingController.ts
import { Request, Response } from 'express';
import { ListingService } from '../services/ListingService.js';
import { PriceService } from '../services/PriceService.js';
import { CardService } from '../services/CardService.js';
import { isValidCardCondition, isValidQuantity, isValidPrice } from '../utils/validators.js';
import { ValidationError } from '../utils/errors.js';

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
        marginMultiplier: marginMultiplier || 1.2,
        costPrice
      });

      res.status(201).json({
        success: true,
        data: listing
      });
    } catch (error) {
      res.status((error as any).statusCode || 500).json({
        error: (error as Error).message
      });
    }
  }

  /**
   * PATCH /api/admin/listings/:id/price
   * Update listing price and margin
   */
  static async updatePrice(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { referencePrice, marginMultiplier, reason, notes } = req.body;

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
      const newPrice = await PriceService.calculateFinalPrice({
        referencePrice,
        marginMultiplier: marginMultiplier || listing.marginMultiplier,
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
        marginMultiplier || listing.marginMultiplier,
        'MANUAL_UPDATE',
        'admin', // TODO: get from auth context
        notes
      );

      res.json({
        success: true,
        message: 'Price updated',
        volatile: isVolatile
      });
    } catch (error) {
      res.status((error as any).statusCode || 500).json({
        error: (error as Error).message
      });
    }
  }
}

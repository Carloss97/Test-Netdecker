import prisma from '../utils/db.js';
import { ValidationError, NotFoundError, ConflictError } from '../utils/errors.js';
import OrderReceiptPdfService from './OrderReceiptPdfService.js';
import CouponService from './CouponService.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class PaymentService {
  static generateOrderNumber() {
    return `ORD-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`;
  }

  /**
   * Procesa una venta de PoS de forma atómica.
   */
  static async processPosSale(input: {
    items: { listingId: string; quantity: number }[];
    storeId?: string | null;
    customerEmail?: string | null;
    paymentMethod?: string | null;
    performedBy?: string | null;
    externalReference?: string | null;
    couponCode?: string | null;
  }) {
    if (!input.items || !Array.isArray(input.items) || input.items.length === 0) {
      throw new ValidationError('Cart items are required');
    }


    // Idempotency: if externalReference provided, return existing order if present
    if (input.externalReference) {
      try {
        const existing = await prisma.order.findFirst({ where: { notes: String(input.externalReference) } });
        if (existing && existing.id) {
          console.info('PaymentService: existing order found for externalReference', String(input.externalReference));
          const ord = await prisma.order.findUnique({ where: { id: existing.id }, include: { items: true } });
          return ord ?? existing;
        }
      } catch (err) {
        // If lookup fails, proceed with normal flow (do not block the sale)
        console.error('PaymentService idempotency lookup failed', err);
      }
    }

    const order = await prisma.$transaction(async (tx: any) => {
      // Fetch listings referenced by the cart
      const listingIds = input.items.map((it) => it.listingId);
      const listings = await tx.listing.findMany({
        where: {
          id: { in: listingIds },
          ...(input.storeId ? { storeId: input.storeId } : {}),
        },
      });
      const listingMap: Map<string, any> = new Map(listings.map((l: any) => [String((l as any).id), l as any]));

      const listingStoreIds = Array.from(new Set(
        listings
          .map((listing: { storeId?: string | null }) => listing.storeId)
          .filter((storeId: string | null | undefined): storeId is string => typeof storeId === 'string' && storeId.length > 0),
      ));

      if (listingStoreIds.length === 0) {
        throw new ValidationError('Cannot process sale without tenant store context');
      }

      if (listingStoreIds.length > 1) {
        throw new ValidationError('Cannot process sale across multiple stores in one order');
      }

      const effectiveStoreId = listingStoreIds[0];
      if (input.storeId && input.storeId !== effectiveStoreId) {
        throw new ValidationError('Provided storeId does not match listing tenant');
      }

      let subtotal = 0;
      let totalCOGS = 0;

      for (const it of input.items) {
        const listing = listingMap.get(it.listingId) as any;
        if (!listing) throw new NotFoundError(`Listing not found: ${it.listingId}`);
        const qty = Number(it.quantity || 0);
        if (qty <= 0) throw new ValidationError('Quantity must be > 0');
        if (Number(listing.quantity || 0) < qty) throw new ValidationError(`Insufficient stock for listing ${it.listingId}`);

        const unitPrice = Number(listing.finalPrice || 0);
        const costPrice = Number(listing.costPrice || 0);

        subtotal += unitPrice * qty;
        totalCOGS += costPrice * qty;
      }

      // --- NEW COUPON LOGIC ---
      let discountAmount = 0;
      let couponId: string | undefined;

      if (input.couponCode) {
        const validation = await CouponService.validateCoupon(effectiveStoreId, input.couponCode, subtotal);
        discountAmount = validation.discountAmount;
        couponId = validation.couponId;
        await CouponService.incrementUsage(couponId, tx);
      }

      const tax = 0;
      const total = Math.max(0, subtotal + tax - discountAmount);
      const orderNumber = this.generateOrderNumber();

      // Determine initial fulfillment status based on payment method
      const payMethod = (input.paymentMethod as any) || 'CASH';
      const initialFulfillmentStatus = (payMethod === 'CASH' || payMethod === 'CARD') ? 'PAID' : 'PENDING_PAYMENT';

      const order = await tx.order.create({
        data: {
          storeId: effectiveStoreId,
          orderNumber,
          customerEmail: input.customerEmail || 'POS',
          status: 'CONFIRMED',
          paymentMethod: payMethod,
          fulfillmentStatus: initialFulfillmentStatus,
          subtotal,
          tax,
          total,
          discountAmount,
          couponId: couponId || null,
          ...(input.externalReference ? { notes: String(input.externalReference) } : {}),
        }
      });

      // Create items, stock movements and update listings
      for (const it of input.items) {
        const listing = listingMap.get(it.listingId) as any;
        const qty = Number(it.quantity || 0);
        const unitPrice = Number(listing.finalPrice || 0);
        const subtotalItem = unitPrice * qty;

        await tx.orderItem.create({
          data: {
            orderId: order.id,
            listingId: it.listingId,
            quantity: qty,
            pricePerUnit: unitPrice,
            subtotal: subtotalItem,
          }
        });

        await tx.stockMovement.create({
          data: {
            listingId: it.listingId,
            warehouseId: null,
            quantity: qty,
            type: 'OUT',
            reference: `pos:${order.id}`,
            performedBy: input.performedBy || null,
          }
        });

        const updatedListing = await tx.listing.updateMany({
          where: {
            id: it.listingId,
            storeId: effectiveStoreId,
            quantity: { gte: qty },
          },
          data: { quantity: { decrement: qty } },
        });

        if (!updatedListing || updatedListing.count === 0) {
          throw new ConflictError(`Insufficient stock for listing ${it.listingId}`);
        }
      }

      // Accounting (best-effort): revenue and COGS
      try {
        const storeId = effectiveStoreId;
        const revenueAccount = await tx.account.findFirst({ where: { storeId, type: 'REVENUE' } });
        const assetAccount = await tx.account.findFirst({ where: { storeId, type: 'ASSET' } });
        const expenseAccount = await tx.account.findFirst({ where: { storeId, type: 'EXPENSE' } });

        if (subtotal > 0 && revenueAccount && assetAccount) {
          await tx.journalEntry.create({
            data: {
              storeId,
              description: `POS Sale ${order.orderNumber}`,
              date: new Date(),
              totalDebit: subtotal,
              totalCredit: subtotal,
              lines: {
                create: [
                  { accountId: assetAccount.id, debit: subtotal, credit: 0, description: 'Sale proceeds' },
                  { accountId: revenueAccount.id, debit: 0, credit: subtotal, description: 'Sales revenue' },
                ]
              }
            }
          });
        }

        if (totalCOGS > 0 && expenseAccount && assetAccount) {
          await tx.journalEntry.create({
            data: {
              storeId,
              description: `COGS POS Sale ${order.orderNumber}`,
              date: new Date(),
              totalDebit: totalCOGS,
              totalCredit: totalCOGS,
              lines: {
                create: [
                  { accountId: expenseAccount.id, debit: totalCOGS, credit: 0, description: 'Cost of goods sold' },
                  { accountId: assetAccount.id, debit: 0, credit: totalCOGS, description: 'Inventory decrease' },
                ]
              }
            }
          });
        }
      } catch (err) {
        // best-effort: do not fail sale for accounting errors
      }

      return order;
    });

    // Persist receipt outside transaction (best-effort)
    try {
      await persistReceiptIfNeeded(order);
    } catch (err) {
      // Do not fail the sale if receipt persistence fails
      console.error('persistReceiptIfNeeded error', err);
    }

    return order;
  }
}

export default PaymentService;
// After creating order in transaction, optionally generate and persist a receipt
// Note: This helper is executed outside the transaction to avoid locking issues.
export async function persistReceiptIfNeeded(order: any) {
  if (!order || !order.id) return;
  if (process.env.SKIP_ORDER_RECEIPT_SAVE === 'true') return;

  try {
    const pdfBuffer = await OrderReceiptPdfService.generatePdfForOrder(order.id);
    const storageDir = process.env.RECEIPT_STORAGE_DIR ? path.resolve(process.env.RECEIPT_STORAGE_DIR) : path.resolve(__dirname, '../../public/receipts');
    await fs.mkdir(storageDir, { recursive: true });
    const filename = `${order.orderNumber || order.id}.pdf`;
    const filePath = path.join(storageDir, filename);
    await fs.writeFile(filePath, pdfBuffer);
    const receiptUrl = `/receipts/files/${filename}`;
    try { await prisma.order.update({ where: { id: order.id }, data: { receiptUrl } }); } catch (e) { console.error('Failed to update order with receiptUrl', e); }
  } catch (err: any) {
    console.error('Failed to persist order receipt', err?.message || err);
  }
}

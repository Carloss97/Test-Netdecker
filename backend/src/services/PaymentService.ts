import prisma from '../utils/db.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import OrderReceiptPdfService from './OrderReceiptPdfService.js';
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
   * - items: [{ listingId, quantity }]
   * - crea `Order` + `OrderItem[]`, crea `StockMovement` OUT y decrementa `Listing.quantity`.
   * - genera asientos contables (venta y COGS) si existen cuentas configuradas para la tienda.
   */
  static async processPosSale(input: {
    items: { listingId: string; quantity: number }[];
    storeId?: string | null;
    customerEmail?: string | null;
    paymentMethod?: string | null;
    performedBy?: string | null;
    externalReference?: string | null;
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
      const listings = await tx.listing.findMany({ where: { id: { in: listingIds } } });
      const listingMap: Map<string, any> = new Map(listings.map((l: any) => [String((l as any).id), l as any]));

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

      const tax = 0;
      const total = subtotal + tax;
      const orderNumber = this.generateOrderNumber();

      const order = await tx.order.create({
        data: {
          storeId: input.storeId || null,
          orderNumber,
          customerEmail: input.customerEmail || 'POS',
          status: 'CONFIRMED',
          subtotal,
          tax,
          total,
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

        await tx.listing.update({ where: { id: it.listingId }, data: { quantity: Number(listing.quantity || 0) - qty } });
      }

      // Accounting (best-effort): revenue and COGS
      try {
        const storeId = input.storeId || null;
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

import prisma from '../utils/db.js';
import StripeService from './StripeService.js';
import { ValidationError } from '../utils/errors.js';

type StripeCharge = {
  id: string;
  amount: number;
  created: number;
  currency?: string | null;
  paymentIntentId: string;
};

type LocalStripeOrder = {
  id: string;
  orderNumber: string;
  total: number;
  createdAt: Date;
  notes: string | null;
};

export type PaymentDiscrepancyType = 'STRIPE_ORPHAN' | 'DB_ORPHAN';

export type PaymentDiscrepancy = {
  type: PaymentDiscrepancyType;
  message: string;
  stripeChargeId?: string;
  stripePaymentIntentId?: string;
  orderId?: string;
  orderNumber?: string;
  amount?: number;
  currency?: string | null;
  createdAt?: string;
};

export type ReconcileDailyInput = {
  windowStart?: Date;
  windowEnd?: Date;
};

export type ReconcileDailyResult = {
  reportId: string;
  windowStart: string;
  windowEnd: string;
  totalStripeTransactions: number;
  totalLocalOrders: number;
  totalDiscrepancies: number;
  discrepancies: PaymentDiscrepancy[];
};

function stripStripePrefix(reference: string): string {
  return reference.replace(/^stripe_intent:/i, '').trim();
}

function getYesterdayWindow(now = new Date()): { start: Date; end: Date } {
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);

  const start = new Date(end);
  start.setDate(start.getDate() - 1);

  return { start, end };
}

export class PaymentReconciliationService {
  static async reconcileDaily(input: ReconcileDailyInput = {}): Promise<ReconcileDailyResult> {
    const defaultWindow = getYesterdayWindow();
    const windowStart = input.windowStart ?? defaultWindow.start;
    const windowEnd = input.windowEnd ?? defaultWindow.end;

    if (!(windowStart instanceof Date) || Number.isNaN(windowStart.getTime())) {
      throw new ValidationError('windowStart must be a valid Date');
    }

    if (!(windowEnd instanceof Date) || Number.isNaN(windowEnd.getTime())) {
      throw new ValidationError('windowEnd must be a valid Date');
    }

    if (windowStart.getTime() >= windowEnd.getTime()) {
      throw new ValidationError('windowStart must be earlier than windowEnd');
    }

    const [stripeCharges, localOrders] = await Promise.all([
      StripeService.listCharges({ gte: windowStart, lt: windowEnd }),
      prisma.order.findMany({
        where: {
          createdAt: { gte: windowStart, lt: windowEnd },
          notes: { startsWith: 'stripe_intent:' },
        },
        select: {
          id: true,
          orderNumber: true,
          total: true,
          createdAt: true,
          notes: true,
        },
      }) as Promise<LocalStripeOrder[]>,
    ]);

    const discrepancies = this.findDiscrepancies(stripeCharges, localOrders);

    const report = await (prisma as any).paymentReconciliationReport.create({
      data: {
        provider: 'STRIPE',
        status: 'completed',
        windowStart,
        windowEnd,
        totalStripeTransactions: stripeCharges.length,
        totalLocalOrders: localOrders.length,
        totalDiscrepancies: discrepancies.length,
        discrepancies,
      },
      select: { id: true },
    });

    return {
      reportId: String(report.id),
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      totalStripeTransactions: stripeCharges.length,
      totalLocalOrders: localOrders.length,
      totalDiscrepancies: discrepancies.length,
      discrepancies,
    };
  }

  static findDiscrepancies(charges: StripeCharge[], orders: LocalStripeOrder[]): PaymentDiscrepancy[] {
    const discrepancies: PaymentDiscrepancy[] = [];

    const ordersByIntent = new Map<string, LocalStripeOrder>();
    for (const order of orders) {
      const notes = String(order.notes || '').trim();
      if (!notes) continue;
      ordersByIntent.set(stripStripePrefix(notes), order);
    }

    const chargesByIntent = new Map<string, StripeCharge>();
    for (const charge of charges) {
      chargesByIntent.set(charge.paymentIntentId, charge);
      if (!ordersByIntent.has(charge.paymentIntentId)) {
        discrepancies.push({
          type: 'STRIPE_ORPHAN',
          message: 'Stripe charge exists but no Order in DB',
          stripeChargeId: charge.id,
          stripePaymentIntentId: charge.paymentIntentId,
          amount: charge.amount,
          currency: charge.currency ?? null,
          createdAt: new Date(charge.created * 1000).toISOString(),
        });
      }
    }

    for (const order of orders) {
      const notes = String(order.notes || '').trim();
      if (!notes) continue;

      const paymentIntentId = stripStripePrefix(notes);
      if (paymentIntentId && !chargesByIntent.has(paymentIntentId)) {
        discrepancies.push({
          type: 'DB_ORPHAN',
          message: 'Order in DB but no Stripe charge',
          orderId: order.id,
          orderNumber: order.orderNumber,
          stripePaymentIntentId: paymentIntentId,
          amount: order.total,
          createdAt: order.createdAt.toISOString(),
        });
      }
    }

    return discrepancies;
  }

  static async listReports(limit = 30) {
    const parsedLimit = Math.min(Math.max(Number(limit || 30), 1), 200);
    return (prisma as any).paymentReconciliationReport.findMany({
      orderBy: { createdAt: 'desc' },
      take: parsedLimit,
      select: {
        id: true,
        provider: true,
        status: true,
        windowStart: true,
        windowEnd: true,
        totalStripeTransactions: true,
        totalLocalOrders: true,
        totalDiscrepancies: true,
        discrepancies: true,
        createdAt: true,
      },
    });
  }
}

export default PaymentReconciliationService;

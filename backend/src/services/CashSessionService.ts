import prisma from '../utils/db.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';

type CashSessionRecord = {
  id: string;
  sessionId: string;
  storeId?: string | null;
  openedBy?: string | null;
  startingCash: number;
  createdAt?: Date;
};

type CashDiscrepancyEntry = {
  id?: string;
  cashSessionId: string;
  storeId?: string | null;
  actualCashAmount: number;
  theoreticalAmount: number;
  discrepancy: number;
  status?: string;
  notes?: string | null;
  createdAt?: Date;
};

function toNumberOrZero(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundCashAmount(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export class CashSessionService {
  static async openSession(params: { storeId?: string | null; openedBy?: string | null; startingCash?: number }) {
    const { storeId = null, openedBy = null, startingCash = 0 } = params;
    if (typeof startingCash !== 'number' || isNaN(startingCash) || startingCash < 0) throw new ValidationError('Invalid startingCash');

    const session = await prisma.cashSession.create({
      data: {
        storeId,
        openedBy,
        startingCash: Number(startingCash),
        status: 'OPEN'
      }
    });

    return session;
  }

  static async closeSession(sessionId: string, params: { closedBy?: string | null; actualCashAmount?: number; endingCash?: number }) {
    if (!sessionId) throw new ValidationError('sessionId required');
    const { closedBy = null, actualCashAmount, endingCash = undefined } = params;

    const existing = await prisma.cashSession.findUnique({ where: { sessionId } as any }) as CashSessionRecord | null;
    if (!existing) throw new NotFoundError('CashSession not found');

    const closeAt = new Date();
    const physicalCash = actualCashAmount ?? endingCash ?? null;

    const updated = await prisma.cashSession.update({
      where: { sessionId } as any,
      data: {
        closedBy,
        endingCash: physicalCash,
        actualCashAmount: physicalCash,
        status: 'CLOSED',
        closedAt: closeAt,
      },
    });

    let theoreticalAmount = roundCashAmount(toNumberOrZero(existing.startingCash));
    let totalCashTransactions = 0;
    let discrepancy = 0;
    let discrepancyLog: CashDiscrepancyEntry | null = null;

    // Try to compute a non-persistent closing snapshot (total of transactions and breakdown by method).
    // This is best-effort: tests may mock only prisma.cashSession, so guard against missing models.
    try {
      const pOSModel = (prisma as any).pOSSession;
      const txModel = (prisma as any).paymentTransaction;

      if (pOSModel && txModel) {
        const whereSessions: any = {};
        if (existing.storeId) whereSessions.storeId = existing.storeId;
        if (existing.openedBy) whereSessions.userId = existing.openedBy;
        if (existing.createdAt) whereSessions.createdAt = { gte: existing.createdAt, lte: closeAt };

        const sessions = await pOSModel.findMany({ where: whereSessions, select: { id: true } } as any);
        const sessionIds = Array.isArray(sessions) ? sessions.map((s: any) => s.id) : [];

        let closingSnapshot: any = { total: 0, byMethod: {}, sessionCount: sessionIds.length, sessionIds };

        if (sessionIds.length) {
          const txs = await txModel.findMany({ where: { sessionId: { in: sessionIds }, status: 'SUCCESS' } as any, select: { amount: true, method: true } as any });
          const total = txs.reduce((acc: number, t: any) => acc + Number(t.amount || 0), 0);
          const byMethod: Record<string, number> = {};
          for (const t of txs) {
            const m = t.method || 'OTHER';
            byMethod[m] = (byMethod[m] || 0) + Number(t.amount || 0);
          }
          closingSnapshot = { total, byMethod, sessionCount: sessionIds.length, sessionIds };

          totalCashTransactions = roundCashAmount(txs.reduce((acc: number, t: any) => {
            if (String(t.method || '').toUpperCase() !== 'CASH') return acc;
            return acc + toNumberOrZero(t.amount);
          }, 0));
          theoreticalAmount = roundCashAmount(toNumberOrZero(existing.startingCash) + totalCashTransactions);

          const actual = roundCashAmount(toNumberOrZero(physicalCash));
          discrepancy = roundCashAmount(actual - theoreticalAmount);

          if (Number.isFinite(discrepancy) && Math.abs(discrepancy) > 0.0001 && (prisma as any).cashDiscrepancyLog) {
            discrepancyLog = await (prisma as any).cashDiscrepancyLog.create({
              data: {
                cashSessionId: updated.id,
                storeId: existing.storeId || null,
                actualCashAmount: actual,
                theoreticalAmount,
                discrepancy,
                status: 'OPEN',
                notes: `Cash session ${sessionId} closed with discrepancy ${discrepancy}`,
              },
            });
          }
        }

        const finalStatus = Math.abs(discrepancy) > 0.0001 ? 'DISCREPANCY' : 'CLOSED';

        await prisma.cashSession.update({
          where: { sessionId } as any,
          data: {
            theoreticalAmount,
            discrepancy,
            status: finalStatus,
          },
        });

        // Attach non-persistent snapshot to returned object to be delivered by the route.
        (updated as any).closingSnapshot = closingSnapshot;
        (updated as any).theoreticalAmount = theoreticalAmount;
        (updated as any).discrepancy = discrepancy;
        (updated as any).actualCashAmount = roundCashAmount(toNumberOrZero(physicalCash));
        (updated as any).status = finalStatus;
        if (discrepancyLog) (updated as any).discrepancyLog = discrepancyLog;
      }
    } catch (err: unknown) {
      // Don't break close on snapshot errors; log for diagnostics.
      // eslint-disable-next-line no-console
      const msg = err instanceof Error ? err.message : String(err);
      console.error('CashSession close snapshot error', msg);
    }

    return updated;
  }

  static async getSessionById(sessionId: string) {
    if (!sessionId) throw new ValidationError('sessionId required');
    const session = await prisma.cashSession.findUnique({ where: { sessionId } as any });
    if (!session) throw new NotFoundError('CashSession not found');
    return session;
  }

  static async listSessions(storeId?: string | null) {
    const where = storeId ? { storeId } : {};
    return prisma.cashSession.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  static async listDiscrepancies(limit = 50) {
    const parsedLimit = Math.min(Math.max(Number(limit || 50), 1), 200);
    return (prisma as any).cashDiscrepancyLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: parsedLimit,
      select: {
        id: true,
        cashSessionId: true,
        storeId: true,
        actualCashAmount: true,
        theoreticalAmount: true,
        discrepancy: true,
        status: true,
        notes: true,
        createdAt: true,
      },
    }) as Promise<CashDiscrepancyEntry[]>;
  }
}

export default CashSessionService;

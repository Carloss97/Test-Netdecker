import prisma from '../utils/db.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';

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

  static async closeSession(sessionId: string, params: { closedBy?: string | null; endingCash?: number }) {
    if (!sessionId) throw new ValidationError('sessionId required');
    const { closedBy = null, endingCash = undefined } = params;

    const existing = await prisma.cashSession.findUnique({ where: { sessionId } as any });
    if (!existing) throw new NotFoundError('CashSession not found');

    const closeAt = new Date();

    const updated = await prisma.cashSession.update({ where: { sessionId } as any, data: { closedBy, endingCash: endingCash ?? null, status: 'CLOSED', closedAt: closeAt } });

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
        }

        // Attach non-persistent snapshot to returned object to be delivered by the route.
        (updated as any).closingSnapshot = closingSnapshot;
      }
    } catch (err) {
      // Don't break close on snapshot errors; log for diagnostics.
      // eslint-disable-next-line no-console
      console.error('CashSession close snapshot error', err?.message || err);
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
}

export default CashSessionService;

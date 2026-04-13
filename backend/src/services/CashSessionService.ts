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

    const updated = await prisma.cashSession.update({ where: { sessionId } as any, data: { closedBy, endingCash: endingCash ?? null, status: 'CLOSED', closedAt: new Date() } });
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

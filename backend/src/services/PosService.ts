import prisma from '../utils/db.js';

export class PosService {
  static async createSession(input: {
    storeId?: string | null;
    userId?: string | null;
    items?: unknown;
    subtotal?: number;
    tax?: number;
    total?: number;
    status?: string;
  }) {
    const session = await (prisma as any).pOSSession.create({
      data: {
        storeId: input.storeId || null,
        userId: input.userId || null,
        items: input.items || null,
        subtotal: Number(input.subtotal || 0),
        tax: Number(input.tax || 0),
        total: Number(input.total || 0),
        status: (input.status as any) || undefined,
      }
    });

    return session;
  }

  static async getSessionByPublicId(sessionId: string) {
    return (prisma as any).pOSSession.findUnique({ where: { sessionId } as any, include: { transactions: true } as any } as any);
  }

  static async createTransaction(sessionPublicId: string, input: {
    method: string;
    amount: number;
    status?: string;
    processorResponse?: unknown;
    processorReference?: string;
  }) {
    const session = await (prisma as any).pOSSession.findUnique({ where: { sessionId: sessionPublicId } as any, select: { id: true } as any } as any);
    if (!session) throw new Error('POS session not found');

    const tx = await (prisma as any).paymentTransaction.create({
      data: {
        sessionId: session.id,
        method: input.method || 'OTHER',
        amount: Number(input.amount || 0),
        status: (input.status as any) || undefined,
        processorResponse: input.processorResponse || null,
        processorReference: input.processorReference || null,
      }
    });

    return tx;
  }

  static async listTransactions(sessionPublicId: string) {
    const session = await (prisma as any).pOSSession.findUnique({ where: { sessionId: sessionPublicId } as any, select: { id: true } as any } as any);
    if (!session) return [];
    return (prisma as any).paymentTransaction.findMany({ where: { sessionId: session.id } as any, orderBy: { createdAt: 'asc' } as any } as any);
  }
}

export default PosService;

import prisma from '../utils/db.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { InventoryService } from './InventoryService.js';

export class PosService {
  /**
   * Creates a new POS session.
   */
  static async createSession(input: {
    storeId?: string | null;
    userId?: string | null;
    items?: any;
    subtotal?: number;
    tax?: number;
    total?: number;
    status?: string;
  }) {
    // POSSession is the correct model name from schema.prisma
    const session = await prisma.pOSSession.create({
      data: {
        storeId: input.storeId || null,
        userId: input.userId || null,
        items: input.items || null,
        subtotal: Number(input.subtotal || 0),
        tax: Number(input.tax || 0),
        total: Number(input.total || 0),
        status: input.status || 'OPEN',
      }
    });

    return session;
  }

  /**
   * Retrieves a session by its public sessionId.
   */
  static async getSessionByPublicId(sessionId: string) {
    const sess = await prisma.pOSSession.findUnique({
      where: { sessionId },
      include: {
        transactions: true,
        store: true,
      }
    });
    
    if (!sess) return null;

    // Handle SQLite JSON stringification if needed
    if (typeof sess.items === 'string') {
      try {
        (sess as any).items = JSON.parse(sess.items);
      } catch {
        // keep as string
      }
    }
    
    return sess;
  }

  /**
   * Records a payment transaction for a session.
   */
  static async createTransaction(sessionPublicId: string, input: {
    method: string;
    amount: number;
    status?: string;
    processorResponse?: unknown;
    processorReference?: string;
  }) {
    const session = await prisma.pOSSession.findUnique({
      where: { sessionId: sessionPublicId },
      select: { id: true, storeId: true }
    });
    
    if (!session) throw new NotFoundError('POS session not found');

    const tx = await prisma.paymentTransaction.create({
      data: {
        sessionId: session.id,
        method: (input.method as any) || 'OTHER',
        amount: Number(input.amount || 0),
        status: (input.status as any) || 'PENDING',
        processorResponse: input.processorResponse || null,
        processorReference: input.processorReference || null,
      }
    });

    return tx;
  }

  /**
   * Completes a POS session by closing it, creating an Order, 
   * and updating inventory stock.
   */
  static async completeSession(sessionId: string) {
    return prisma.$transaction(async (tx: any) => {
      const session = await tx.pOSSession.findUnique({
        where: { sessionId },
        include: { transactions: true }
      });

      if (!session) throw new NotFoundError('POS session not found');
      if (session.status === 'CLOSED') throw new ValidationError('Session already closed');

      // 1. Create the Order so it can be printed
      const order = await tx.order.create({
        data: {
          storeId: session.storeId,
          total: session.total,
          subtotal: session.subtotal,
          tax: session.tax,
          status: 'PAID',
          paymentStatus: 'PAID',
          paymentMethod: session.transactions[0]?.method || 'CASH',
          items: session.items || [],
          notes: `POS Session: ${session.sessionId}`,
          currency: 'CLP',
        }
      });

      // 2. Decrement stock for each item in the session
      const items = Array.isArray(session.items) ? session.items : [];
      for (const item of items) {
        if (item.listingId && item.quantity) {
          await tx.listing.updateMany({
            where: { id: item.listingId, quantity: { gte: item.quantity } },
            data: { quantity: { decrement: item.quantity } }
          });

          await tx.stockMovement.create({
            data: {
              listingId: item.listingId,
              quantity: item.quantity,
              type: 'OUT',
              notes: `POS Sale Order ${order.id}`
            }
          });
        }
      }

      // 3. Close the session
      await tx.pOSSession.update({
        where: { id: session.id },
        data: { status: 'CLOSED' }
      });

      return { session, order };
    });
  }

  static async listTransactions(sessionPublicId: string) {
    const session = await prisma.pOSSession.findUnique({
      where: { sessionId: sessionPublicId },
      select: { id: true }
    });
    if (!session) return [];
    
    return prisma.paymentTransaction.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' }
    });
  }
}

export default PosService;

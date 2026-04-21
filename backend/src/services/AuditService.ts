import prisma from '../utils/db.js';

export class AuditService {
  static async logAction(params: {
    userId?: string | null;
    action: string;
    entity?: string | null;
    entityId?: string | null;
    data?: unknown;
    ip?: string | null;
    userAgent?: string | null;
  }) {
    const { userId, action, entity, entityId, data, ip, userAgent } = params;
    try {
      // Optimistic write: attempt to create with provided userId. If the
      // referenced AdminUser is not present (FK violation), retry without
      // `userId` and preserve the original id inside the `data` JSON.
      await prisma.auditTrail.create({
        data: {
          userId: userId ?? null,
          action,
          entity: entity ?? null,
          entityId: entityId ?? null,
          data: data ?? null,
          ip: ip ?? null,
          userAgent: userAgent ?? null,
        },
      });
    } catch (err: any) {
      // If this is a foreign-key violation on userId, attempt a safe retry
      // that omits the `userId` and stores the original id inside `data`.
      const isFK = err && (err.code === 'P2003' || (err.meta && String(err.meta.field_name || '').toLowerCase().includes('userid')));
      if (isFK) {
        try {
          let payload: any = data ?? null;
          if (userId) {
            if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
              payload = { ...payload, __originalUserId: userId };
            } else {
              payload = { __originalUserId: userId, payload };
            }
          }
          await prisma.auditTrail.create({
            data: {
              userId: null,
              action,
              entity: entity ?? null,
              entityId: entityId ?? null,
              data: payload,
              ip: ip ?? null,
              userAgent: userAgent ?? null,
            },
          });
          return;
        } catch (err2) {
          console.error('[AuditService] failed to write audit trail on retry', err2);
          return;
        }
      }

      // Non-fatal: auditing should not break the main request flow
      console.error('[AuditService] failed to write audit trail', err);
    }
  }
}

export default AuditService;

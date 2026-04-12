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
      await prisma.auditTrail.create({
        data: {
          userId: userId ?? null,
          action,
          entity: entity ?? null,
          entityId: entityId ?? null,
          data: data ?? null,
          ip: ip ?? null,
          userAgent: userAgent ?? null,
        }
      });
    } catch (err) {
      // Non-fatal: auditing should not break the main request flow
      console.error('[AuditService] failed to write audit trail', err);
    }
  }
}

export default AuditService;

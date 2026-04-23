import prisma from '../utils/db.js';

type AuditEntityType = 'listing' | 'price' | 'order';
type AuditOperation = 'CREATE' | 'UPDATE' | 'DELETE';

function toObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

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
          operation: 'REQUEST',
          entity: entity ?? null,
          entityType: entity ?? null,
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
              operation: 'REQUEST',
              entity: entity ?? null,
              entityType: entity ?? null,
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

  static computeDiff(oldValue: unknown, newValue: unknown): Record<string, { from: unknown; to: unknown }> {
    const oldObj = toObject(oldValue);
    const newObj = toObject(newValue);
    const keys = new Set<string>([...Object.keys(oldObj), ...Object.keys(newObj)]);
    const diff: Record<string, { from: unknown; to: unknown }> = {};

    for (const key of keys) {
      const before = oldObj[key];
      const after = newObj[key];
      if (before !== after) {
        diff[key] = { from: before, to: after };
      }
    }

    return diff;
  }

  static async auditEntityChange(params: {
    entityType: AuditEntityType;
    entityId: string;
    operation?: AuditOperation;
    oldValue?: unknown;
    newValue?: unknown;
    changedBy?: string | null;
    action?: string;
    data?: unknown;
  }) {
    const {
      entityType,
      entityId,
      operation = 'UPDATE',
      oldValue = null,
      newValue = null,
      changedBy,
      action,
      data,
    } = params;

    const diff = this.computeDiff(oldValue, newValue);
    const payloadData = data ?? null;

    try {
      await prisma.auditTrail.create({
        data: {
          userId: changedBy ?? null,
          action: action || `${entityType.toUpperCase()}.${operation}`,
          operation,
          entity: entityType,
          entityType,
          entityId,
          oldValue: oldValue ?? null,
          newValue: newValue ?? null,
          diff,
          data: payloadData,
        },
      });
    } catch (err: any) {
      const isFK = err && (err.code === 'P2003' || (err.meta && String(err.meta.field_name || '').toLowerCase().includes('userid')));
      if (!isFK) {
        return;
      }

      let fallbackData: any = payloadData;
      if (changedBy) {
        if (fallbackData && typeof fallbackData === 'object' && !Array.isArray(fallbackData)) {
          fallbackData = { ...fallbackData, __originalUserId: changedBy };
        } else {
          fallbackData = { __originalUserId: changedBy, payload: fallbackData };
        }
      }

      try {
        await prisma.auditTrail.create({
          data: {
            userId: null,
            action: action || `${entityType.toUpperCase()}.${operation}`,
            operation,
            entity: entityType,
            entityType,
            entityId,
            oldValue: oldValue ?? null,
            newValue: newValue ?? null,
            diff,
            data: fallbackData,
          },
        });
      } catch {
        // Non-fatal: auditing should not break the primary flow.
      }
    }
  }

  static async getEntityAuditTrail(params: {
    entityType?: string;
    entityId?: string;
    take?: number;
  }) {
    const take = Math.min(Math.max(Number(params.take || 50), 1), 200);
    return prisma.auditTrail.findMany({
      where: {
        ...(params.entityType ? { entityType: params.entityType } : {}),
        ...(params.entityId ? { entityId: params.entityId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }
}

export default AuditService;

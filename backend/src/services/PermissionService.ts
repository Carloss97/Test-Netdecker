import prisma from '../utils/db.js';

type AdminRole = 'ADMIN' | 'MANAGER' | 'STAFF';

const DEFAULT_PERMISSIONS: Record<Exclude<AdminRole, 'ADMIN'>, Array<{ action: string; resource: string }>> = {
  MANAGER: [
    { action: 'view', resource: '*' },
    { action: 'approve', resource: 'price' },
    { action: 'reject', resource: 'price' },
    { action: 'manage', resource: 'inventory' },
    { action: 'update', resource: 'store' },
    { action: 'create', resource: 'account' },
    { action: 'update', resource: 'account' },
    { action: 'delete', resource: 'account' },
    { action: 'create', resource: 'threshold' },
    { action: 'update', resource: 'threshold' },
    { action: 'delete', resource: 'threshold' },
  ],
  STAFF: [
    { action: 'view', resource: 'dashboard' },
    { action: 'view', resource: 'stock-alerts' },
    { action: 'view', resource: 'price-volatility' },
    { action: 'view', resource: 'edition' },
    { action: 'view', resource: 'price' },
  ],
};

function matchPermission(
  permission: { action: string; resource: string },
  action: string,
  resource: string,
): boolean {
  const actionMatch = permission.action === '*' || permission.action === action;
  const resourceMatch = permission.resource === '*' || permission.resource === resource;
  return actionMatch && resourceMatch;
}

export class PermissionService {
  static async checkPermission(role: AdminRole, action: string, resource: string): Promise<boolean> {
    if (role === 'ADMIN') {
      return true;
    }

    const normalizedAction = String(action || '').trim().toLowerCase();
    const normalizedResource = String(resource || '').trim().toLowerCase();

    if (!normalizedAction || !normalizedResource) {
      return false;
    }

    try {
      const rows = await (prisma as any).rolePermission.findMany({
        where: { role },
        select: { action: true, resource: true },
      });

      if (Array.isArray(rows) && rows.length > 0) {
        return rows.some((row: { action: string; resource: string }) =>
          matchPermission(
            {
              action: String(row.action || '').toLowerCase(),
              resource: String(row.resource || '').toLowerCase(),
            },
            normalizedAction,
            normalizedResource,
          ));
      }
    } catch {
      // If RolePermission table/client is not yet available, fall back to default map.
    }

    const defaults = DEFAULT_PERMISSIONS[role as Exclude<AdminRole, 'ADMIN'>] || [];
    return defaults.some((p) => matchPermission(p, normalizedAction, normalizedResource));
  }
}

export default PermissionService;

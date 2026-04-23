import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';
import PermissionService from '../services/PermissionService.js';

export function requirePermission(action: string, resource: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const admin = (req as any).adminUser as { id: string; role: 'ADMIN' | 'MANAGER' | 'STAFF'; storeId?: string | null } | undefined;

    if (!admin) {
      throw new UnauthorizedError('Not authenticated');
    }

    // If both contexts exist, enforce manager/staff store scope.
    if (admin.role !== 'ADMIN' && admin.storeId && (req as any).store?.id && admin.storeId !== (req as any).store.id) {
      console.warn('[RBAC] denied', {
        reason: 'insufficient permissions',
        role: admin.role,
        action,
        resource,
        adminStoreId: admin.storeId,
        requestStoreId: (req as any).store.id,
      });
      throw new ForbiddenError('insufficient permissions');
    }

    const allowed = await PermissionService.checkPermission(admin.role, action, resource);
    if (!allowed) {
      console.warn('[RBAC] denied', {
        reason: 'insufficient permissions',
        role: admin.role,
        action,
        resource,
        userId: admin.id,
        path: req.path,
      });
      throw new ForbiddenError('insufficient permissions');
    }

    next();
  };
}

export default requirePermission;

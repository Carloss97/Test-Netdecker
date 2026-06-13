import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';
import PermissionService from '../services/PermissionService.js';

export function requirePermission(action: string, resource: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    // Local development bypass
    if (process.env.DEV_NO_AUTH === 'true') return next();

    const admin = (req as any).adminUser as { id: string; role: 'ADMIN' | 'MANAGER' | 'STAFF'; storeId?: string | null } | undefined;

    if (!admin) {
      throw new UnauthorizedError('Not authenticated');
    }

    const adminStoreId = typeof admin.storeId === 'string' ? admin.storeId.trim() : '';
    const isGlobalAdmin = admin.role === 'ADMIN' && adminStoreId.length === 0;

    if (isGlobalAdmin) {
      return next();
    }

    // If both contexts exist, enforce tenant scope for non-global admins.
    if (adminStoreId && (req as any).store?.id && adminStoreId !== (req as any).store.id) {
      console.warn('[RBAC] denied', {
        reason: 'insufficient permissions',
        role: admin.role,
        action,
        resource,
        adminStoreId,
        requestStoreId: (req as any).store.id,
      });
      throw new ForbiddenError('insufficient permissions');
    }

    // Store-scoped ADMIN keeps full permissions, but only inside its own tenant scope.
    if (admin.role === 'ADMIN' && adminStoreId) {
      return next();
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

import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../utils/errors.js';

export default function requireTenant(req: Request, _res: Response, next: NextFunction) {
  if ((req as any).store) return next();
  throw new UnauthorizedError('Tenant not found or missing credentials');
}

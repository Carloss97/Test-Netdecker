import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import prisma from '../utils/db.js';

function extractToken(req: Request) {
  const auth = String(req.headers['authorization'] || '');
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return String(req.headers['x-admin-token'] || '').trim();
}

export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) throw new UnauthorizedError('Missing admin token');

  const sess = await prisma.adminSession.findUnique({ where: { token }, include: { user: true } });
  if (!sess) throw new UnauthorizedError('Invalid admin token');
  if (sess.expiresAt && sess.expiresAt.getTime() < Date.now()) throw new UnauthorizedError('Session expired');
  if (!sess.user || !sess.user.isActive) throw new ForbiddenError('User disabled');

  // Attach minimal user to request
  (req as any).adminUser = { id: sess.user.id, email: sess.user.email, role: (sess.user as any).role };
  return next();
}

export function requireAdminRole(role: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = (req as any).adminUser;
    if (!user) throw new UnauthorizedError('Not authenticated');
    if (user.role !== role) throw new ForbiddenError('Insufficient role');
    return next();
  };
}

export default requireAdmin;

import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import prisma from '../utils/db.js';

function extractToken(req: Request): { token: string; source: string } {
  const auth = String(req.headers['authorization'] || '');
  if (auth.toLowerCase().startsWith('bearer ')) return { token: auth.slice(7).trim(), source: 'authorization' };

  // Check explicit header first
  const headerToken = String(req.headers['x-admin-token'] || '').trim();
  if (headerToken) return { token: headerToken, source: 'x-admin-token' };

  // If cookie parsing middleware is present, prefer that
  const anyReq = req as any;
  if (anyReq.cookies && anyReq.cookies.auth_token) return { token: String(anyReq.cookies.auth_token).trim(), source: 'cookie-parser' };

  // Fallback: parse Cookie header manually
  const cookieHeader = String(req.headers['cookie'] || '');
  if (cookieHeader) {
    const parts = cookieHeader.split(';').map((p) => p.trim());
    for (const p of parts) {
      if (p.startsWith('auth_token=')) {
        return { token: decodeURIComponent(p.substring('auth_token='.length)), source: 'cookie-header' };
      }
    }
  }

  return { token: '', source: 'none' };
}

export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const { token, source } = extractToken(req);
  const debug = process.env.DEBUG_ADMIN === '1' || process.env.DEBUG_ADMIN === 'true';
  if (!token) {
    if (debug) {
      // log minimal header/cookie context to help debugging without dumping secrets
      try {
        const ah = String(req.headers['authorization'] || '').slice(0, 200);
        const xat = String(req.headers['x-admin-token'] ? 'present' : 'absent');
        const cookieHdr = String(req.headers['cookie'] || '').slice(0, 400);
        console.debug('[requireAdmin] missing token', { path: req.path, authorizationSample: ah, xAdminToken: xat, cookieHeaderSample: cookieHdr });
      } catch (_) {}
    }
    throw new UnauthorizedError('Missing admin token');
  }

  if (debug) {
    try {
      const masked = token.length > 10 ? `${token.slice(0,6)}...${token.slice(-4)}` : token;
      console.debug('[requireAdmin] token extracted', { path: req.path, source, tokenMasked: masked });
    } catch (_) {}
  }

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

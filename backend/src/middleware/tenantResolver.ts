import { Request, Response, NextFunction } from 'express';
import prisma from '../utils/db.js';
import StoreService from '../services/StoreServiceImpl.js';

function extractAdminToken(req: Request): string {
  const auth = String(req.headers.authorization || '').trim();
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }

  const xAdminToken = String(req.headers['x-admin-token'] || '').trim();
  if (xAdminToken) return xAdminToken;

  const cookieHeader = String(req.headers.cookie || '');
  if (cookieHeader) {
    const parts = cookieHeader.split(';').map((part) => part.trim());
    for (const part of parts) {
      if (part.startsWith('auth_token=')) {
        return decodeURIComponent(part.substring('auth_token='.length));
      }
    }
  }

  return '';
}

/**
 * Tenant resolver middleware
 * Resolution order:
 *  1. `x-store-slug` or `x-tenant-slug` header
 *  2. `req.params.slug` or `req.params.storeSlug` (useful for public routes)
 *  3. `x-api-key` header or Bearer token matched against `Store.apiKeyHash` (legacy/plain match)
 *
 * Attaches a minimal `store` object to `req` when found: { id, slug, name }
 */
export default async function tenantResolver(req: Request, _res: Response, next: NextFunction) {
  try {
    const slugHeader = (req.headers['x-store-slug'] || req.headers['x-tenant-slug']) as string | undefined;
    const storeIdHeader = String(req.headers['x-store-id'] || '').trim() || undefined;
    const apiKeyHeader = (req.headers['x-api-key'] || (typeof req.headers.authorization === 'string' ? String(req.headers.authorization).replace(/^Bearer\s+/i, '') : undefined)) as string | undefined;

    const slugParam = (req.params && (req.params.slug || (req.params as any).storeSlug)) as string | undefined;
    const slug = slugHeader || slugParam;

    let store: any = null;

    let adminSessionStoreId: string | undefined;
    let adminSessionStore: { id: string; slug: string; name: string } | null = null;
    const adminToken = extractAdminToken(req);
    if (adminToken) {
      try {
        const session = await prisma.adminSession.findUnique({
          where: { token: adminToken },
          select: {
            expiresAt: true,
            storeId: true,
            store: {
              select: {
                id: true,
                slug: true,
                name: true,
              },
            },
          },
        });

        const notExpired = !session?.expiresAt || session.expiresAt.getTime() > Date.now();
        if (session && notExpired) {
          adminSessionStoreId = typeof session.storeId === 'string' ? session.storeId.trim() || undefined : undefined;
          adminSessionStore = session.store ?? null;
        }
      } catch (err) {
        // ignore
      }
    }

    // A tenant-scoped admin session must always resolve to its own store.
    if (adminSessionStoreId) {
      if (adminSessionStore && adminSessionStore.id === adminSessionStoreId) {
        store = adminSessionStore;
      } else {
        try {
          store = await prisma.store.findUnique({
            where: { id: adminSessionStoreId },
            select: { id: true, slug: true, name: true },
          });
        } catch (err) {
          // ignore
        }
      }
    }

    if (!store && slug) {
      try {
        store = await prisma.store.findUnique({ where: { slug } });
      } catch (err) {
        // Ignore DB errors here and let global handler surface them if necessary
      }
    }

    if (!store && apiKeyHeader) {
      try {
        // Try to resolve by hashed/secure api key using StoreService helper
        store = await StoreService.findByApiKey(apiKeyHeader);
      } catch (err) {
        // ignore
      }
    }

    if (!store && storeIdHeader) {
      try {
        store = await prisma.store.findUnique({ where: { id: storeIdHeader } });
      } catch (err) {
        // ignore
      }
    }

    if (!store && adminSessionStore) {
      store = adminSessionStore;
    }

    if (store) {
      (req as any).store = { id: store.id, slug: store.slug, name: store.name };
    }

    return next();
  } catch (err) {
    return next(err as Error);
  }
}

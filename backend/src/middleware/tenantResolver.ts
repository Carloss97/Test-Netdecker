import { Request, Response, NextFunction } from 'express';
import prisma from '../utils/db.js';

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
    const apiKeyHeader = (req.headers['x-api-key'] || (typeof req.headers.authorization === 'string' ? String(req.headers.authorization).replace(/^Bearer\s+/i, '') : undefined)) as string | undefined;

    const slugParam = (req.params && (req.params.slug || (req.params as any).storeSlug)) as string | undefined;
    const slug = slugHeader || slugParam;

    let store: any = null;
    if (slug) {
      try {
        store = await prisma.store.findUnique({ where: { slug } });
      } catch (err) {
        // Ignore DB errors here and let global handler surface them if necessary
      }
    }

    if (!store && apiKeyHeader) {
      // For initial version, store.apiKeyHash may contain a plaintext API key
      // We'll do a direct match; production should use hashed API keys.
      try {
        store = await prisma.store.findFirst({ where: { apiKeyHash: apiKeyHeader } });
      } catch (err) {
        // ignore
      }
    }

    if (store) {
      (req as any).store = { id: store.id, slug: store.slug, name: store.name };
    }

    return next();
  } catch (err) {
    return next(err as Error);
  }
}

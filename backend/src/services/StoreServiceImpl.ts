import crypto from 'crypto';
import prisma from '../utils/db.js';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js';

// Generate a random API key (hex)
function generateApiKey() {
  return crypto.randomBytes(24).toString('hex');
}

// Hash api key with scrypt and store as salt:hashHex
function hashApiKey(apiKey: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(apiKey, salt, 64);
  return `${salt}:${derived.toString('hex')}`;
}

function verifyApiKeyAgainstHash(apiKey: string, stored: string) {
  if (!stored || typeof stored !== 'string') return false;
  // Backwards compatibility: if stored is plain (no ':'), allow direct equality
  if (!stored.includes(':')) return stored === apiKey;
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, hashHex] = parts;
  try {
    const derived = crypto.scryptSync(apiKey, salt, 64);
    const a = Buffer.from(derived.toString('hex'), 'hex');
    const b = Buffer.from(hashHex, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

class StoreServiceImpl {
  static async createStore(input: { slug: string; name: string; description?: string }) {
    const slug = String(input.slug || '').trim().toLowerCase();
    const name = String(input.name || '').trim();
    if (!slug) throw new ValidationError('slug is required');
    if (!name) throw new ValidationError('name is required');
    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);

    try {
      const data: any = { slug, name, description: input.description ?? null, apiKeyHash };
      if ((input as any).currency !== undefined) data.currency = (input as any).currency;
      if ((input as any).taxRate !== undefined) data.taxRate = Number((input as any).taxRate);
      if ((input as any).settings !== undefined) data.settings = typeof (input as any).settings === 'string' ? (input as any).settings : JSON.stringify((input as any).settings);

      const store = await prisma.store.create({ data });
      return { store, apiKey };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Unique constraint failed') || msg.includes('UNIQUE constraint failed')) {
        throw new ConflictError('Store with this slug already exists');
      }
      throw err;
    }
  }

  static async updateStore(storeId: string, input: { name?: string; description?: string; currency?: string; taxRate?: number; settings?: any }) {
    const existing = await prisma.store.findUnique({ where: { id: storeId } });
    if (!existing) throw new NotFoundError('Store not found');

    const data: any = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.currency !== undefined) data.currency = input.currency;
    if (input.taxRate !== undefined) data.taxRate = Number(input.taxRate);
    if (input.settings !== undefined) data.settings = typeof input.settings === 'string' ? input.settings : JSON.stringify(input.settings);

    const updated = await prisma.store.update({ where: { id: storeId }, data });
    return updated;
  }

  static async rotateApiKey(storeId: string) {
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundError('Store not found');
    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);
    await prisma.store.update({ where: { id: storeId }, data: { apiKeyHash } });
    return { apiKey };
  }

  static verifyApiKey(apiKey: string, storedHash: string | null | undefined) {
    if (!storedHash) return false;
    return verifyApiKeyAgainstHash(apiKey, storedHash);
  }

  static async findByApiKey(apiKey: string) {
    if (!apiKey) return null;
    const stores = await prisma.store.findMany({ where: { apiKeyHash: { not: null } } });
    for (const s of stores) {
      if (s.apiKeyHash && verifyApiKeyAgainstHash(apiKey, s.apiKeyHash)) return s;
    }
    return null;
  }

  static async getBySlug(slug: string) {
    return prisma.store.findUnique({ where: { slug } });
  }

  static async listStores() {
    return prisma.store.findMany({ orderBy: { createdAt: 'desc' } });
  }
}

export default StoreServiceImpl;

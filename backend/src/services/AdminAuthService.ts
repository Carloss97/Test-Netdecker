import prisma from '../utils/db.js';
import crypto from 'crypto';
import { promisify } from 'util';
import { UnauthorizedError, ConflictError, ValidationError } from '../utils/errors.js';

const scryptAsync = promisify(crypto.scrypt);

function safeHex(buf: Buffer) {
  return buf.toString('hex');
}

async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return { salt, hash: safeHex(derived) };
}

async function verifyPassword(password: string, salt: string, expectedHash: string) {
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  const got = safeHex(derived);
  try {
    const a = Buffer.from(got, 'hex');
    const b = Buffer.from(expectedHash, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export class AdminAuthService {
  static async createUser(email: string, password: string, role: 'ADMIN' | 'MANAGER' | 'STAFF' = 'ADMIN') {
    const existing = await prisma.adminUser.findUnique({ where: { email } });
    if (existing) throw new ConflictError('Admin user already exists');

    const { salt, hash } = await hashPassword(password);
    const user = await prisma.adminUser.create({
      data: { email, passwordHash: hash, passwordSalt: salt, role: role as any },
    });

    return { id: user.id, email: user.email, role: user.role };
  }

  // Optional `storeId` allows creating tenant-scoped admin sessions when supported by the schema.
  static async authenticate(email: string, password: string, storeId?: string | null) {
    const user = await prisma.adminUser.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedError('Invalid credentials');

    const ok = await verifyPassword(password, user.passwordSalt, user.passwordHash);
    if (!ok) throw new UnauthorizedError('Invalid credentials');

    // create session token
    const token = crypto.randomBytes(48).toString('hex');
    const days = Number(process.env.ADMIN_SESSION_DAYS || '7');
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    let normalizedStoreId: string | null = null;
    const requestedStore = typeof storeId === 'string' ? storeId.trim() : '';
    if (requestedStore) {
      let store = await prisma.store.findUnique({
        where: { id: requestedStore },
        select: { id: true },
      });

      if (!store) {
        store = await prisma.store.findUnique({
          where: { slug: requestedStore.toLowerCase() },
          select: { id: true },
        });
      }

      if (!store) {
        throw new ValidationError('storeId is invalid or unknown');
      }

      normalizedStoreId = store.id;
    }

    // Try to store `storeId` when available in the DB schema; fall back if column missing.
    try {
      // Use `any` to avoid TypeScript errors on projects whose generated client lacks the field.
      await (prisma as any).adminSession.create({ data: { token, userId: user.id, expiresAt, storeId: normalizedStoreId } });
    } catch (err) {
      // Fall back for databases without `storeId` column.
      await prisma.adminSession.create({ data: { token, userId: user.id, expiresAt } });
    }
    await prisma.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    return { token, user: { id: user.id, email: user.email, role: user.role, storeId: normalizedStoreId || undefined }, expiresAt };
  }

  static async validateToken(token: string) {
    if (!token) return null;
    const sess = await prisma.adminSession.findUnique({ where: { token }, include: { user: true } as any });
    if (!sess) return null;
    if (sess.expiresAt && sess.expiresAt.getTime() < Date.now()) return null;
    if (!sess.user || !sess.user.isActive) return null;
    // Expose optional storeId when present on the session row.
    return { id: sess.user.id, email: sess.user.email, role: (sess.user as any).role, storeId: (sess as any).storeId || null };
  }

  static async logout(token: string) {
    if (!token) return;
    await prisma.adminSession.deleteMany({ where: { token } });
  }
}

export default AdminAuthService;

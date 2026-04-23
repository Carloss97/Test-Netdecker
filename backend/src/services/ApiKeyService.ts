import crypto from 'crypto';
import prisma from '../utils/db.js';
import { NotFoundError } from '../utils/errors.js';

export type ApiKeyType = 'IMPORT' | 'PRICE_SYNC';

export type RotatedApiKey = {
  id: string;
  name: string;
  keyType: ApiKeyType;
  apiKey: string;
};

const KEY_TYPE_NAMES: Record<ApiKeyType, string> = {
  IMPORT: 'IMPORT_API_KEY',
  PRICE_SYNC: 'PRICE_SYNC_KEY',
};

const KEY_TYPE_ENV: Record<ApiKeyType, string> = {
  IMPORT: 'IMPORT_API_KEY',
  PRICE_SYNC: 'PRICE_SYNC_KEY',
};

function generateApiKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

function hashApiKey(apiKey: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(apiKey, salt, 64);
  return `${salt}:${derived.toString('hex')}`;
}

function verifyApiKeyAgainstHash(apiKey: string, storedHash: string): boolean {
  if (!storedHash || typeof storedHash !== 'string') return false;
  if (!storedHash.includes(':')) {
    return storedHash === apiKey;
  }

  const [salt, hashHex] = storedHash.split(':');
  if (!salt || !hashHex) return false;

  try {
    const derived = crypto.scryptSync(apiKey, salt, 64);
    const a = Buffer.from(derived.toString('hex'), 'hex');
    const b = Buffer.from(hashHex, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function computeExpiresAt(days = 90): Date {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt;
}

export class ApiKeyService {
  static hashApiKey(apiKey: string): string {
    return hashApiKey(apiKey);
  }

  static verifyApiKeyAgainstHash(apiKey: string, storedHash: string): boolean {
    return verifyApiKeyAgainstHash(apiKey, storedHash);
  }

  static async ensureSeededKey(keyType: ApiKeyType) {
    const name = KEY_TYPE_NAMES[keyType];
    const existing = await prisma.apiKey.findFirst({ where: { keyType, isActive: true } });
    if (existing) return existing;

    const envKey = String(process.env[KEY_TYPE_ENV[keyType]] || '').trim();
    if (!envKey) return null;

    const keyHash = hashApiKey(envKey);
    try {
      return await prisma.apiKey.create({
        data: {
          name,
          keyType,
          keyHash,
          isActive: true,
          rotatedAt: new Date(),
          expiresAt: computeExpiresAt(90),
        },
      });
    } catch {
      return await prisma.apiKey.findFirst({ where: { keyType, isActive: true } });
    }
  }

  static async ensureBootstrapKeys() {
    await Promise.all([this.ensureSeededKey('IMPORT'), this.ensureSeededKey('PRICE_SYNC')]);
  }

  static async verifyProvidedKey(keyType: ApiKeyType, providedKey: string): Promise<boolean> {
    if (!providedKey) return false;
    const key = await this.ensureSeededKey(keyType);
    if (!key) return false;

    const activeKeys = await prisma.apiKey.findMany({ where: { keyType, isActive: true } });
    return (activeKeys as Array<{ keyType?: string; isActive?: boolean; keyHash: string }>).some((row) => {
      return row.keyType === keyType && row.isActive !== false && verifyApiKeyAgainstHash(providedKey, row.keyHash);
    });
  }

  static async rotateApiKeyById(
    apiKeyId: string,
    options: { rotatedBy?: string | null; reason?: string; expiresInDays?: number } = {},
  ): Promise<RotatedApiKey> {
    const current = await prisma.apiKey.findUnique({ where: { id: apiKeyId } });
    if (!current) throw new NotFoundError('API key not found');

    const newApiKey = generateApiKey();
    const newKeyHash = hashApiKey(newApiKey);
    const expiresAt = computeExpiresAt(options.expiresInDays ?? 90);

    await prisma.apiKey.update({
      where: { id: apiKeyId },
      data: {
        keyHash: newKeyHash,
        rotatedAt: new Date(),
        expiresAt,
        isActive: true,
      },
    });

    await prisma.apiKeyRotationLog.create({
      data: {
        apiKeyId,
        oldKeyHash: current.keyHash,
        newKeyHash,
        reason: options.reason || 'manual-rotation',
        rotatedBy: options.rotatedBy || null,
      },
    });

    return { id: current.id, name: current.name, keyType: current.keyType as ApiKeyType, apiKey: newApiKey };
  }

  static async rotateExpiredKeys(): Promise<Array<RotatedApiKey>> {
    const now = new Date();
    const allKeys = await prisma.apiKey.findMany({});
    const expiredKeys = (allKeys as Array<{ id: string; name: string; keyType: string; isActive?: boolean; expiresAt?: Date | null }>).filter((key) => {
      return key.isActive !== false && key.expiresAt instanceof Date && key.expiresAt.getTime() <= now.getTime();
    });

    const rotated: RotatedApiKey[] = [];
    for (const key of expiredKeys) {
      rotated.push(await this.rotateApiKeyById(key.id, { reason: 'auto-rotation' }));
    }

    return rotated;
  }

  static async listApiKeys() {
    const keys = await prisma.apiKey.findMany({});
    return [...(keys as Array<{ createdAt?: Date }>)].sort((left, right) => {
      const leftTime = left.createdAt instanceof Date ? left.createdAt.getTime() : 0;
      const rightTime = right.createdAt instanceof Date ? right.createdAt.getTime() : 0;
      return rightTime - leftTime;
    });
  }

  static async getApiKeyById(apiKeyId: string) {
    return prisma.apiKey.findUnique({ where: { id: apiKeyId } });
  }

  static async listExpiredApiKeys() {
    const now = new Date();
    const keys = await prisma.apiKey.findMany({});
    return [...(keys as Array<{ isActive?: boolean; expiresAt?: Date | null }>)].filter((key) => {
      return key.isActive !== false && key.expiresAt instanceof Date && key.expiresAt.getTime() <= now.getTime();
    }).sort((left, right) => {
      const leftTime = left.expiresAt instanceof Date ? left.expiresAt.getTime() : 0;
      const rightTime = right.expiresAt instanceof Date ? right.expiresAt.getTime() : 0;
      return leftTime - rightTime;
    });
  }
}

export default ApiKeyService;
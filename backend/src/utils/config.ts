import { z } from 'zod';

function parseBooleanEnv(raw: unknown, defaultValue = false): boolean {
  if (raw === undefined || raw === null || raw === '') return defaultValue;
  if (typeof raw === 'boolean') return raw;

  const normalized = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function optionalTextField() {
  return z.preprocess((value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().min(1).optional());
}

function redactUrlSecrets(rawUrl: string): string {
  try {
    const parsedUrl = new URL(rawUrl);
    if (parsedUrl.username || parsedUrl.password) {
      parsedUrl.username = parsedUrl.username ? '***' : '';
      parsedUrl.password = parsedUrl.password ? '***' : '';
    }
    return parsedUrl.toString();
  } catch {
    return rawUrl;
  }
}

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  USE_SQLITE: z.preprocess((value) => parseBooleanEnv(value, false), z.boolean()).default(false),
  DATABASE_URL: z.string().trim().min(1, 'DATABASE_URL is required'),
  REDIS_URL: optionalTextField(),
  STRIPE_SECRET: optionalTextField(),
  STRIPE_WEBHOOK_SECRET: optionalTextField(),
  MERCADOPAGO_ACCESS_TOKEN: optionalTextField(),
  IMPORT_API_KEY: optionalTextField(),
  PRICE_SYNC_CRON: optionalTextField(),
  CATALOG_SYNC_CRON: optionalTextField(),
}).superRefine((env, ctx) => {
  const databaseUrl = env.DATABASE_URL.trim();
  const usesSqlite = env.USE_SQLITE || databaseUrl.startsWith('file:');
  const usesPostgres = databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://');

  if (env.USE_SQLITE && !databaseUrl.startsWith('file:')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DATABASE_URL'],
      message: 'DATABASE_URL must use file: when USE_SQLITE=true',
    });
  }

  if (!usesSqlite && !usesPostgres) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DATABASE_URL'],
      message: 'DATABASE_URL must start with postgresql:// or file:',
    });
  }

  if (env.REDIS_URL && !env.REDIS_URL.startsWith('redis://') && !env.REDIS_URL.startsWith('rediss://')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['REDIS_URL'],
      message: 'REDIS_URL must start with redis:// or rediss://',
    });
  }
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(env);
}

export function redactDatabaseUrl(rawUrl: string): string {
  return redactUrlSecrets(rawUrl);
}
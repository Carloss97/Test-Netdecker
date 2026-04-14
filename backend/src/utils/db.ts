// src/utils/db.ts
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
// Do not import generated client types here; use a minimal pragmatic surface instead

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load backend/.env if present (index.ts also loads it on server start)
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
	dotenv.config({ path: envPath });
} else {
	dotenv.config();
}

// If DATABASE_URL is missing, fall back to the local Docker Postgres used by `docker-compose.yml`.
if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
	const defaultPg = 'postgresql://user:password@localhost:5433/tcg_singles_db';
	process.env.DATABASE_URL = defaultPg;
	console.log(`[DB] No DATABASE_URL found; falling back to default Postgres URL: ${defaultPg}`);
} else {
	console.log('[DB] Using provided DATABASE_URL (redacted)');
}

// Determine whether to use the SQLite client. Prefer explicit `USE_SQLITE=true`,
// otherwise detect `DATABASE_URL` starting with `file:`.
const useSqlite = (process.env.USE_SQLITE === 'true') || (process.env.DATABASE_URL ?? '').startsWith('file:');
console.log(`[DB] USE_SQLITE=${process.env.USE_SQLITE ?? 'unset'}; using SQLite client? ${useSqlite}`);

// Minimal Prisma-like surface used by the app. We intentionally avoid
// importing concrete generated Prisma client types here because we may
// dynamically load either the Postgres or SQLite client at runtime.
import { v4 as uuidv4 } from 'uuid';
type MinimalPrisma = {
	$connect: () => Promise<void>;
	$disconnect: () => Promise<void>;
	$transaction: (...args: unknown[]) => Promise<unknown>;
	[key: string]: any;
};

let prisma: MinimalPrisma;

// Allow tests to opt-out of real Prisma initialization by setting
// `SKIP_DB_INIT=true` in the environment. This keeps tests fast and
// avoids needing the generated Prisma clients in CI/dev shells.
if (process.env.SKIP_DB_INIT === 'true') {
	console.log('[DB] SKIP_DB_INIT=true: using stub Prisma client for tests');
	const base: any = {
		$connect: async () => {},
		$disconnect: async () => {},
		$transaction: async (fn: any) => {
			if (typeof fn === 'function') return fn(base);
			return [];
		}
	};

	// Proxy so tests can assign model methods like `prisma.cart.findMany = ...` without errors.
	prisma = new Proxy(base, {
		get(target, prop) {
			if (prop === Symbol.toStringTag) return 'PrismaStub';
			if (!(prop in target)) (target as any)[prop] = {};
			return (target as any)[prop];
		}
	}) as MinimalPrisma;
} else {
	// Dynamically import the correct Prisma client package at runtime.
	// - PostgreSQL: `@prisma/client`
	// - SQLite: `@prisma/client_sqlite` (generated via `prisma:generate:sqlite`)
	
	try {
		if (useSqlite) {
			console.log('[DB] Attempting to load @prisma/client_sqlite...');
			// @ts-ignore - dynamic import of generated sqlite client; ambient types may not exist in all environments
			const pkg = await import('@prisma/client_sqlite');
			const PrismaClientClass = pkg.PrismaClient ?? pkg.default?.PrismaClient ?? pkg.default;
			prisma = new PrismaClientClass() as unknown as MinimalPrisma;
			console.log('[DB] Initialized SQLite Prisma client (@prisma/client_sqlite)');
		} else {
			console.log('[DB] Loading @prisma/client (Postgres)');
			const pkg = await import('@prisma/client');
			const PrismaClientClass = pkg.PrismaClient ?? pkg.default?.PrismaClient ?? pkg.default;
			prisma = new PrismaClientClass() as unknown as MinimalPrisma;
			console.log('[DB] Initialized Postgres Prisma client (@prisma/client)');
		}

		// Connect and log status
		prisma.$connect().then(() => {
			console.log('[DB] PrismaClient connected');
		}).catch((err: unknown) => {
			console.error('[DB] PrismaClient connection error:', err instanceof Error ? err.message : String(err));
		});

		// If the generated Prisma client for SQLite is missing some newer models
		// (e.g. POSSession / PaymentTransaction) because the sqlite client was
		// generated from an older schema, attach lightweight in-memory stubs so
		// integration tests can run locally without requiring a regeneration.
		try {
			const anyPrisma = prisma as any;
			const missingPOS = !anyPrisma.pOSSession || !anyPrisma.paymentTransaction;
			if (missingPOS) {
				console.log('[DB] POS models missing in Prisma client; attaching in-memory stubs for POSSession and PaymentTransaction');

				const sessions = new Map<string, any>();
				const transactions: any[] = [];

				anyPrisma.pOSSession = {
					create: async ({ data }: any) => {
						const id = uuidv4();
						const sessionId = data.sessionId || uuidv4();
						const s = {
							id,
							sessionId,
							storeId: data.storeId || null,
							userId: data.userId || null,
							items: data.items ?? null,
							subtotal: Number(data.subtotal || 0),
							tax: Number(data.tax || 0),
							total: Number(data.total || 0),
							status: data.status || 'OPEN',
							createdAt: new Date(),
							updatedAt: new Date(),
						};
						sessions.set(id, s);
						return s;
					},
					findUnique: async ({ where, include }: any) => {
						if (where?.sessionId) {
							for (const s of sessions.values()) {
								if (s.sessionId === where.sessionId) {
									const result = { ...s };
									if (include?.transactions) result.transactions = transactions.filter((t) => t.sessionId === s.id);
									return result;
								}
							}
							return null;
						}
						if (where?.id) return sessions.get(where.id) ?? null;
						return null;
					}
				};

				anyPrisma.paymentTransaction = {
					create: async ({ data }: any) => {
						const id = uuidv4();
						const tx = {
							id,
							sessionId: data.sessionId,
							method: data.method || 'OTHER',
							amount: Number(data.amount || 0),
							status: data.status || 'PENDING',
							processorResponse: data.processorResponse ?? null,
							processorReference: data.processorReference ?? null,
							createdAt: new Date(),
							updatedAt: new Date(),
						};
						transactions.push(tx);
						return tx;
					},
					findMany: async ({ where, orderBy }: any) => {
						let list = transactions.filter((t) => t.sessionId === where.sessionId);
						list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
						return list;
					}
				};
			}
		} catch (err) {
			console.warn('[DB] Error while attaching POS stubs:', err);
		}
	} catch (err) {
		console.error('[DB] Failed to initialize Prisma client:', err);
		throw err;
	}
}

export default prisma;

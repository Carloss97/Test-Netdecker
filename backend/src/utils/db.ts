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

// If DATABASE_URL is missing, fall back to local SQLite (Pages D1 / local dev).
// Prefer SQLite by default for Cloudflare Pages D1 compatibility and simpler local dev.
if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
	const defaultSqlite = 'file:./dev.sqlite';
	process.env.DATABASE_URL = defaultSqlite;
	// Mark explicit preference for SQLite client loading
	process.env.USE_SQLITE = 'true';
	console.log(`[DB] No DATABASE_URL found; falling back to local SQLite at ${defaultSqlite} and enabling USE_SQLITE=true`);
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
		// Simple in-memory model storage used by the stub. Provides lightweight
		// implementations of common Prisma model methods so tests can run without
		// a real database when `SKIP_DB_INIT=true`.
		const modelMemory = new Map<string, Map<string, any>>();

		function createModelHandler(modelName: string) {
			const store = new Map<string, any>();

			function mkId() {
				return `mock-${Math.random().toString(36).slice(2, 9)}`;
			}

			return {
				create: async ({ data }: { data: any }) => {
					if (process.env.DEBUG_PRISMA_STUB === 'true') console.log('[PRISMA-STUB] create', modelName, data);
					const id = data.id ?? mkId();
					const rec: any = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
					// Provide common default public identifiers used by the real Prisma schema
					if (!rec.sessionId && /session/i.test(modelName)) {
						rec.sessionId = `sess-${mkId()}`;
					}
					if (!rec.listingId && /listing/i.test(modelName) && typeof rec.listingId === 'undefined') {
						// leave user-provided listingId as-is; generate only when missing
						// rec.listingId = `L${mkId()}`;
					}
					store.set(id, rec);
					return rec;
				},
				findUnique: async ({ where }: { where: any }) => {
					if (process.env.DEBUG_PRISMA_STUB === 'true') console.log('[PRISMA-STUB] findUnique', modelName, where);
					if (!where) return null;
					if (where.id) return store.get(where.id) ?? null;
					if (where.sessionId) {
						const entries = Array.from(store.values());
						return entries.find((r) => r.sessionId === where.sessionId) ?? null;
					}
					// Support common unique fields like slug or apiKeyHash
					const entries = Array.from(store.values());
					if (where.slug) return entries.find((r) => r.slug === where.slug) ?? null;
					if (where.apiKeyHash) return entries.find((r) => r.apiKeyHash === where.apiKeyHash) ?? null;
					return null;
				},
				findFirst: async ({ where }: any) => {
					const entries = Array.from(store.values());
					if (!where) return entries[0] ?? null;
					return entries.find((r) => {
						for (const k of Object.keys(where)) {
							const cond = (where as any)[k];
							if (typeof cond === 'object' && cond?.not !== undefined) {
								if (r[k] === cond.not) return false;
							} else if (r[k] !== cond) return false;
						}
						return true;
					}) ?? null;
				},
				findMany: async ({ where }: any = {}) => {
					const entries = Array.from(store.values());
					if (!where) return entries;
					if (where.id && where.id.in) return entries.filter(e => where.id.in.includes(e.id));
					if (where.slug) return entries.filter(e => e.slug === where.slug);
					return entries;
				},
				delete: async ({ where }: any) => {
					if (!where || !where.id) return null;
					const rec = store.get(where.id);
					store.delete(where.id);
					return rec ?? null;
				},
				deleteMany: async ({ where }: any = {}) => {
					const toDelete: string[] = [];
					for (const [id, rec] of store.entries()) {
						let match = true;
						if (where) {
							for (const k of Object.keys(where)) {
								if (rec[k] !== where[k]) { match = false; break; }
							}
						}
						if (match) toDelete.push(id);
					}
					for (const id of toDelete) store.delete(id);
					return { count: toDelete.length };
				},
				update: async ({ where, data }: any) => {
					const rec = store.get(where.id);
					if (!rec) return null;
					const updated = { ...rec, ...data, updatedAt: new Date() };
					store.set(where.id, updated);
					return updated;
				},
				updateMany: async ({ where, data }: any) => {
					let count = 0;
					for (const [id, rec] of store.entries()) {
						let match = true;
						if (where) {
							for (const k of Object.keys(where)) {
								const cond = where[k];
								if (typeof cond === 'object' && cond.gte !== undefined) {
									if (!(rec[k] >= cond.gte)) match = false;
								} else if (typeof cond === 'object' && cond.not !== undefined) {
									if (rec[k] === cond.not) match = false;
								} else if (rec[k] !== cond) match = false;
							}
						}
						if (match) { store.set(id, { ...rec, ...data }); count++; }
					}
					return { count };
				},
				upsert: async ({ where, update, create }: any) => {
					if (where && where.id && store.has(where.id)) {
						const existing = store.get(where.id);
						const updated = { ...existing, ...update, updatedAt: new Date() };
						store.set(where.id, updated);
						return updated;
					}
					const id = (create && create.id) ? create.id : mkId();
					const rec = { id, ...(create || {}), createdAt: new Date(), updatedAt: new Date() };
					store.set(id, rec);
					return rec;
				},
				count: async ({ where }: any = {}) => {
					if (!where) return store.size;
					if (where.id && where.id.in) return Array.from(store.values()).filter(e => where.id.in.includes(e.id)).length;
					return store.size;
				},
				aggregate: async (_args: any) => ({ _sum: {} }),
			};
		}

		// Proxy so tests can assign model methods like `prisma.cart.findMany = ...` without errors.
		prisma = new Proxy(base, {
			get(target, prop) {
				if (prop === Symbol.toStringTag) return 'PrismaStub';
				if (!(prop in target)) {
					const name = String(prop);
					const handler = createModelHandler(name);
					(target as any)[prop] = handler;
				}
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
	} catch (err) {
		console.error('[DB] Failed to initialize Prisma client:', err);
		throw err;
	}
}

export default prisma;

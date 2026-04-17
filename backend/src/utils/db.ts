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

function createPrismaStub(): MinimalPrisma {
	console.log('[DB] Creating fallback Prisma stub');
	let baseProxy: any = null;
	const base: any = {
		$connect: async () => {},
		$disconnect: async () => {},
		$transaction: async (fn: any) => {
			// Ensure transactions receive the full proxied client with model handlers
			if (typeof fn === 'function') return fn(baseProxy ?? base);
			return [];
		}
	};

	const modelMemory = new Map<string, Map<string, any>>();

	function createModelHandler(modelName: string) {
 		const store = new Map<string, any>();
 		function mkId() { return `mock-${Math.random().toString(36).slice(2, 9)}`; }
 		return {
 			create: async ({ data }: { data: any }) => {
 				const id = data.id ?? mkId();
 				const rec: any = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
 				store.set(id, rec);
 				return rec;
 			},
 			findUnique: async ({ where }: { where: any }) => {
				if (!where) return null;
				if (where.id) return store.get(where.id) ?? null;
				const entries = Array.from(store.values());
				// If caller requests a unique lookup by a single non-id field, try to match it
				const whereKeys = Object.keys(where || {});
				if (whereKeys.length === 1) {
					const k = whereKeys[0];
					const v = where[k];
					if (v && typeof v === 'object') {
						// nested composite unique (e.g., { tcgId_editionCode: { tcgId: 't-1', editionCode: 'E1' } })
						const nestedKeys = Object.keys(v);
						const found = entries.find((entry) => nestedKeys.every((nk) => entry[nk] === v[nk]));
						if (found) return found;
					} else {
						const found = entries.find((entry) => entry[k] === v);
						if (found) return found;
					}
				}
				// common unique fields fallback
				if (where.sessionId) {
					const entriesA = Array.from(store.values());
					return entriesA.find((r) => r.sessionId === where.sessionId) ?? null;
				}
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
				// Apply Prisma-like numeric operations (increment / decrement) for numeric fields
				const applied = { ...rec };
				for (const key of Object.keys(data || {})) {
					const val = data[key];
					if (val && typeof val === 'object') {
						if (typeof val.decrement === 'number') {
							applied[key] = Number(applied[key] || 0) - val.decrement;
							continue;
						}
						if (typeof val.increment === 'number') {
							applied[key] = Number(applied[key] || 0) + val.increment;
							continue;
						}
					}
					applied[key] = val;
				}
				applied.updatedAt = new Date();
				store.set(where.id, applied);
				return applied;
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
					if (match) {
						// Apply numeric ops similar to Prisma
						const applied = { ...rec };
						for (const key of Object.keys(data || {})) {
							const val = data[key];
							if (val && typeof val === 'object') {
								if (typeof val.decrement === 'number') {
									applied[key] = Number(applied[key] || 0) - val.decrement;
									continue;
								}
								if (typeof val.increment === 'number') {
									applied[key] = Number(applied[key] || 0) + val.increment;
									continue;
								}
							}
							applied[key] = val;
						}
						applied.updatedAt = new Date();
						store.set(id, applied);
						count++;
					}
				}
				return { count };
			},
			upsert: async ({ where, update, create }: any) => {
				// Try id-based upsert first
				if (where && where.id && store.has(where.id)) {
					const existing = store.get(where.id);
					const updated = { ...existing, ...(update || {}), updatedAt: new Date() };
					store.set(where.id, updated);
					return updated;
				}

				// Attempt to find existing entry by other unique shapes (single-field or nested composite)
				if (where && Object.keys(where).length > 0) {
					for (const k of Object.keys(where)) {
						const v = where[k];
						if (v && typeof v === 'object') {
							const nestedKeys = Object.keys(v);
							const foundEntry = Array.from(store.entries()).find(([, rec]) => nestedKeys.every((nk) => rec[nk] === v[nk]));
							if (foundEntry) {
								const [foundId, existing] = foundEntry;
								const updated = { ...existing, ...(update || {}), updatedAt: new Date() };
								store.set(foundId, updated);
								return updated;
							}
						} else {
							const foundEntry = Array.from(store.entries()).find(([, rec]) => rec[k] === v);
							if (foundEntry) {
								const [foundId, existing] = foundEntry;
								const updated = { ...existing, ...(update || {}), updatedAt: new Date() };
								store.set(foundId, updated);
								return updated;
							}
						}
					}
				}

				// Fallback: create new record
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

	baseProxy = new Proxy(base, {
		get(target, prop) {
			if (prop === Symbol.toStringTag) return 'PrismaStub';
			if (!(prop in target)) {
				const name = String(prop);
				const handler = createModelHandler(name);
				(target as any)[prop] = handler;
			}
			return (target as any)[prop];
		}
	});

	return baseProxy as MinimalPrisma;
}

// Allow tests to opt-out of real Prisma initialization by setting
// `SKIP_DB_INIT=true` in the environment. This keeps tests fast and
// avoids needing the generated Prisma clients in CI/dev shells.
if (process.env.SKIP_DB_INIT === 'true') {
	console.log('[DB] SKIP_DB_INIT=true: using stub Prisma client for tests');
	prisma = createPrismaStub();
} else {
	// Dynamically import the correct Prisma client package at runtime.
	// - PostgreSQL: `@prisma/client`
	// - SQLite: `@prisma/client_sqlite` (generated via `prisma:generate:sqlite`)
	try {
		// Avoid noisy import attempts when generated Prisma clients are not installed.
		// Check for package.json presence under backend/node_modules before attempting dynamic import.
		const pkgPath = useSqlite
			? path.resolve(__dirname, '../../node_modules/@prisma/client_sqlite/package.json')
			: path.resolve(__dirname, '../../node_modules/@prisma/client/package.json');

		if (!fs.existsSync(pkgPath)) {
			console.warn(`[DB] Prisma client package not found at ${pkgPath}; using in-memory stub`);
			prisma = createPrismaStub();
		} else {
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
		}
	} catch (err) {
		console.error('[DB] Failed to initialize Prisma client:', err);
		console.warn('[DB] Falling back to in-memory Prisma stub to allow startup without generated client');
		prisma = createPrismaStub();
	}
}

export default prisma;

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

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
	console.warn('[DB] No DATABASE_URL found; Postgres is the default. Set `DATABASE_URL` to a Postgres DSN or set `USE_SQLITE=true` to opt into SQLite.');
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
								// Auto-generate common defaults used by Prisma schema when missing
								try {
									if (!Object.prototype.hasOwnProperty.call(rec, 'sessionId') && /session/i.test(modelName)) {
										rec.sessionId = mkId();
									}
								} catch (_) {}
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
								try {
									if (!Object.prototype.hasOwnProperty.call(rec, 'sessionId') && /session/i.test(modelName)) {
										rec.sessionId = mkId();
									}
								} catch (_) {}
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
		let pkgPath: string;
		let clientPackageName: string;
		if (useSqlite) {
			const generatedPath = path.resolve(__dirname, '../../node_modules/@prisma/client_sqlite_generated/package.json');
			const defaultPath = path.resolve(__dirname, '../../node_modules/@prisma/client_sqlite/package.json');
			if (fs.existsSync(generatedPath)) {
				pkgPath = generatedPath;
				clientPackageName = '@prisma/client_sqlite_generated';
			} else {
				pkgPath = defaultPath;
				clientPackageName = '@prisma/client_sqlite';
			}
		} else {
			pkgPath = path.resolve(__dirname, '../../node_modules/@prisma/client/package.json');
			clientPackageName = '@prisma/client';
		}

		if (!fs.existsSync(pkgPath)) {
			console.warn(`[DB] Prisma client package not found at ${pkgPath}; using in-memory stub`);
			prisma = createPrismaStub();
		} else {
			console.log(`[DB] Attempting to load ${clientPackageName}...`);
			// @ts-ignore - dynamic import of generated client; ambient types may not exist in all environments
			const pkg = await import(clientPackageName as any);
			const PrismaClientClass = pkg.PrismaClient ?? pkg.default?.PrismaClient ?? pkg.default;
			const PrismaClientCtor: any = PrismaClientClass as any;
			prisma = new PrismaClientCtor() as MinimalPrisma;
			console.log(`[DB] Initialized Prisma client (${clientPackageName})`);
            

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

// Wrap the Prisma client's $transaction with a simple retry/backoff for
// transient "unable to start a transaction" errors. This helps mitigate
// intermittent transaction-start timeouts observed under high concurrency
// (Neon/managed Postgres pool latencies). Controlled via
// `DB_TRANSACTION_RETRIES` env var (default 3).
(function wrapTransactionWithRetries() {
	try {
		const orig = (prisma as any).$transaction?.bind(prisma);
		if (!orig) return;

		const maxRetries = Number(process.env.DB_TRANSACTION_RETRIES ?? 3) || 3;
		const baseDelayMs = 100;

		(prisma as any).$transaction = async function patchedTransaction(...args: any[]) {
			let attempt = 0;
			// eslint-disable-next-line no-constant-condition
			while (true) {
				try {
					return await orig(...args);
				} catch (err: any) {
					const msg = err && (err.message ?? String(err));
					const isTransient = typeof msg === 'string' && (
						msg.includes('Unable to start a transaction') ||
						msg.includes('Transaction API error') ||
						msg.toLowerCase().includes('timeout')
					);

					if (!isTransient || attempt >= maxRetries) {
						throw err;
					}

					const delay = baseDelayMs * Math.pow(2, attempt);
					// eslint-disable-next-line no-console
					console.warn(`[DB] Transaction start failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms: ${msg}`);
					await new Promise((res) => setTimeout(res, delay));
					attempt += 1;
				}
			}
		};
	} catch (e) {
		// If anything goes wrong here, avoid crashing startup — fallback to
		// existing behaviour.
		// eslint-disable-next-line no-console
		console.warn('[DB] Failed to install $transaction retry wrapper:', e instanceof Error ? e.message : String(e));
	}
})();

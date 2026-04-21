import { pickDb, ensureSchema } from './d1.js';

// Resolve a minimal store object ({ id, slug, name }) from a Cloudflare Pages
// Functions `Request` + `env`. Best-effort: tries header slug, query slug,
// first path segment, then x-api-key / Authorization Bearer against stored hash.
export default async function resolveStoreFromRequest(request, env) {
  try {
    const db = pickDb(env);
    if (db) await ensureSchema(db);

    const headers = (typeof request.headers?.get === 'function')
      ? request.headers
      : new Map(Object.entries(request.headers || {}));

    const slugHeader = headers.get ? (headers.get('x-store-slug') || headers.get('x-tenant-slug')) : (headers['x-store-slug'] || headers['x-tenant-slug']);
    let authHeader = headers.get ? (headers.get('x-api-key') || headers.get('authorization')) : (headers['x-api-key'] || request.headers?.authorization || null);

    let apiKeyHeader = authHeader;
    if (typeof apiKeyHeader === 'string' && apiKeyHeader.toLowerCase().startsWith('bearer ')) apiKeyHeader = apiKeyHeader.slice(7).trim();

    let slug = slugHeader || null;
    try {
      const url = typeof request.url === 'string' ? new URL(request.url) : null;
      if (!slug && url) {
        const slugQuery = url.searchParams.get('slug') || url.searchParams.get('storeSlug') || url.searchParams.get('store_slug');
        slug = slugQuery || null;
        if (!slug) {
          const parts = url.pathname.split('/').filter(Boolean);
          if (parts.length > 0) slug = parts[0];
        }
      }
    } catch (_) {
      // ignore URL parse errors
    }

    // Helper to safely read first row from D1 result
    function firstRow(res) {
      if (!res) return null;
      if (Array.isArray(res.results)) return res.results[0] || null;
      if (Array.isArray(res)) return res[0] || null;
      return null;
    }

    // Try to find by slug first
    if (slug && db) {
      try {
        const r = await db.prepare('SELECT id, slug, name FROM store WHERE slug = ?').bind(String(slug)).all();
        const row = firstRow(r);
        if (row && (row.id || row.ID)) return { id: row.id || row.ID, slug: row.slug || row.SLUG, name: row.name || row.NAME };
      } catch (_) {
        // ignore missing table / column errors
      }
    }

    // Try API key header if present
    if (apiKeyHeader && db) {
      try {
        const res = await db.prepare('SELECT id, slug, name, apiKeyHash FROM store WHERE apiKeyHash IS NOT NULL').all();
        const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);
        for (const r of rows) {
          const stored = r.apiKeyHash || r.APIKEYHASH || r.apikeyhash || r.api_key_hash || r.apikey_hash;
          if (!stored) continue;
          // Backwards compatibility: plain api key stored directly
          if (!String(stored).includes(':')) {
            if (String(stored) === String(apiKeyHeader)) return { id: r.id, slug: r.slug, name: r.name };
            continue;
          }

          // Try Node's crypto.scryptSync when available to verify scrypt-style hashes
          try {
            let cryptoNode = null;
            try { cryptoNode = require('crypto'); } catch (_) { cryptoNode = null; }
            if (cryptoNode && cryptoNode.scryptSync && cryptoNode.timingSafeEqual) {
              const parts = String(stored).split(':');
              if (parts.length !== 2) continue;
              const [salt, hashHex] = parts;
              const derived = cryptoNode.scryptSync(String(apiKeyHeader), salt, 64);
              const a = Buffer.from(derived.toString('hex'), 'hex');
              const b = Buffer.from(String(hashHex), 'hex');
              if (a.length === b.length && cryptoNode.timingSafeEqual(a, b)) {
                return { id: r.id, slug: r.slug, name: r.name };
              }
            }
          } catch (_) {
            // ignore verification errors
          }
        }
      } catch (_) {
        // ignore
      }
    }

    return null;
  } catch (err) {
    return null;
  }
}

export { resolveStoreFromRequest };

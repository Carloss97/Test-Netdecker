import prisma from './db.js';

function createD1Proxy(p = prisma) {
  const prismaClient = p;

  return {
    prepare(sql) {
      const sqlStr = String(sql || '').trim();
      const low = sqlStr.toLowerCase();
      const ctx: any = { bound: [] };

      return {
        bound: [],
        bind(...args) { ctx.bound = args || []; return this; },
        async all() {
          // PRAGMA introspection
          if (low.startsWith('pragma table_info')) return { results: [] };

          // SELECT listing by id
          if (low.includes('from listing') && low.includes('where id =')) {
            const id = ctx.bound && ctx.bound[0];
            const row = await prismaClient.listing.findUnique({ where: { id }, select: { id: true, finalPrice: true, referencePrice: true, exchangeRate: true } });
            return { results: row ? [row] : [] };
          }

          // SELECT card by id
          if (low.includes('from card') && low.includes('where id =')) {
            const id = ctx.bound && ctx.bound[0];
            const rec = await prismaClient.card.findUnique({ where: { id } });
            return { results: rec ? [rec] : [] };
          }

          // Search by name LIKE
          if (low.includes('from card') && low.includes('like')) {
            const pattern = String(ctx.bound && ctx.bound[0] || '').replace(/%/g, '');
            const limit = Number(ctx.bound && ctx.bound[ctx.bound.length - 1]) || 50;
            const where: any = { cardName: { contains: pattern } };
            // Attempt to detect tcg param if present (simple heuristic)
            const maybeTcg = ctx.bound && ctx.bound.length >= 3 ? ctx.bound[1] : null;
            if (maybeTcg && typeof maybeTcg === 'string' && maybeTcg.length <= 20 && !/^[0-9]+$/.test(maybeTcg)) {
              where.tcg = maybeTcg;
            }
            const rows = await prismaClient.card.findMany({ where, take: limit });
            return { results: rows };
          }

          // Select by editionCode
          if (low.includes('from card') && low.includes('where editioncode =')) {
            const ed = ctx.bound && ctx.bound[0];
            const rows = await prismaClient.card.findMany({ where: { editionCode: ed } });
            return { results: rows };
          }

          // Select by tcg
          if (low.includes('from card') && low.includes('where tcg =')) {
            const tcg = ctx.bound && ctx.bound[0];
            const rows = await prismaClient.card.findMany({ where: { tcg } });
            return { results: rows };
          }

          return { results: [] };
        },
        async run() {
          // Handle inserts/updates used by priceSyncService and priceService
          try {
            // Insert priceSyncRun
            if (low.includes('insert into pricesyncrun')) {
              const [id, source, status, notes, total, updated, volatile, failed, roundingMultiple, errors, startedAt, createdAt] = ctx.bound || [];
              await prismaClient.priceSyncRun.create({ data: { id, source, status, notes, total, updated, volatile, failed, roundingMultiple, errors, startedAt: startedAt || null, createdAt: createdAt || null } });
              return {};
            }

            // Update priceSyncRun
            if (low.includes('update pricesyncrun set')) {
              // Last bound param is id
              const bound = ctx.bound || [];
              const id = bound[bound.length - 1];
              // map some fields from front of bound array; best-effort mapping
              const status = bound[0];
              const total = bound[1];
              const updated = bound[2];
              const volatile = bound[3];
              const failed = bound[4];
              const errors = bound[5];
              const completedAt = bound[6];
              await prismaClient.priceSyncRun.update({ where: { id }, data: { status, total, updated, volatile, failed, errors, completedAt } }).catch(() => {});
              return {};
            }

            // Insert or ignore listing -> use upsert
            if (low.includes('insert or ignore into listing')) {
              const [id, cardId, editionCode, referencePrice, marginMultiplier, finalPrice, quantity, status, lastSyncedAt, createdAt] = ctx.bound || [];
              await prismaClient.listing.upsert({ where: { id }, update: {}, create: { id, cardId, editionCode, referencePrice, marginMultiplier, finalPrice, quantity, status, lastSyncedAt, createdAt } }).catch(() => {});
              return {};
            }

            // Update listing
            if (low.includes('update listing set') && low.includes('where id =')) {
              const [referencePrice, marginMultiplier, finalPrice, exchangeRate, lastSyncedAt, id] = ctx.bound || [];
              await prismaClient.listing.update({ where: { id }, data: { referencePrice, marginMultiplier, finalPrice, exchangeRate, lastSyncedAt } }).catch(() => {});
              return {};
            }

            // Insert priceHistory
            if (low.includes('insert into pricehistory')) {
              const bound = ctx.bound || [];
              // attempt to map columns naively by position
              const [id, listingId, oldPrice, newPrice, oldReferencePrice, newReferencePrice, oldExchangeRate, newExchangeRate, reason, percentChange, changedBy, notes, createdAt] = bound;
              await prismaClient.priceHistory.create({ data: { id, listingId, oldPrice, newPrice, oldReferencePrice, newReferencePrice, oldExchangeRate, newExchangeRate, reason, percentChange, changedBy, notes, createdAt } }).catch(() => {});
              return {};
            }
          } catch (err) {
            // swallow to mimic tolerant D1 behavior in tests
          }
          return {};
        }
      };
    }
  };
}

export default createD1Proxy;

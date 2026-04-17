import { pickDb, ensureSchema, firstRow, buildSelectColumns } from './d1.js';

function normalizeRarity(rarity) {
  return (rarity || 'Unknown').trim() || 'Unknown';
}

export async function getCard(db, id) {
  if (!db) return null;
  await ensureSchema(db);
  const res = await db.prepare('SELECT * FROM card WHERE id = ?').bind(id).all();
  return firstRow(res);
}

export async function findCardByCode(db, tcgId, editionCode, cardCode, rarity) {
  if (!db) return null;
  await ensureSchema(db);
  const params = [tcgId, editionCode, cardCode];
  let sql = 'SELECT * FROM card WHERE tcg = ? AND editionCode = ? AND cardCode = ?';
  if (rarity) {
    sql += ' AND rarity = ?';
    params.push(normalizeRarity(rarity));
  }
  const res = await db.prepare(sql).bind(...params).all();
  return firstRow(res);
}

export async function searchByName(db, name, tcgId, limit = 20) {
  if (!db) return [];
  await ensureSchema(db);
  const q = `%${String(name || '').trim()}%`;
  const params = [q];
  let sql = 'SELECT * FROM card WHERE LOWER(cardName) LIKE LOWER(?)';
  if (tcgId) {
    sql += ' AND tcg = ?';
    params.push(tcgId);
  }
  sql += ' LIMIT ?';
  params.push(limit);
  const res = await db.prepare(sql).bind(...params).all();
  const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);
  return rows;
}

export async function getCardsByEdition(db, editionCode) {
  if (!db) return [];
  await ensureSchema(db);
  const res = await db.prepare('SELECT * FROM card WHERE editionCode = ? ORDER BY cardNumber ASC').bind(editionCode).all();
  const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);
  return rows;
}

// Bulk upsert cards using batched INSERT OR REPLACE to be D1-friendly
export async function bulkUpsertCards(db, cards, opts = {}) {
  if (!db || !Array.isArray(cards) || cards.length === 0) return { created: 0, updated: 0 };
  await ensureSchema(db);

  const SQLITE_MAX_VARS = 900;

  const tableCols = { table: 'card', cols: ['id','externalId','tcg','editionCode','cardCode','cardName','rarity','imageUrl','priceMarket','createdAt','updatedAt'] };

  const rows = cards.map((c) => {
    const id = c.id || `${c.tcg}:${c.externalId}`;
    const now = new Date().toISOString();
    return [id, c.externalId ?? null, c.tcg ?? null, c.editionCode ?? null, c.cardCode ?? null, c.cardName ?? null, normalizeRarity(c.rarity), c.imageUrl ?? null, c.priceMarket ?? null, now, now];
  });

  const colCount = tableCols.cols.length;
  const safeBatch = Math.max(1, Math.floor(SQLITE_MAX_VARS / Math.max(1, colCount)));

  const batches = (arr, size) => { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; };

  for (const batch of batches(rows, safeBatch)) {
    const placeholders = batch.map(() => `(${new Array(colCount).fill('?').join(',')})`).join(',');
    const sql = `INSERT OR REPLACE INTO ${tableCols.table} (${tableCols.cols.join(',')}) VALUES ${placeholders};`;
    const params = batch.flat();
    try {
      await db.prepare(sql).bind(...params).run();
    } catch (err) {
      // fallback to per-row inserts
      for (const row of batch) {
        try { await db.prepare(`INSERT OR REPLACE INTO ${tableCols.table} (${tableCols.cols.join(',')}) VALUES (${new Array(colCount).fill('?').join(',')});`).bind(...row).run(); } catch (_) {}
      }
    }
  }

  return { created: cards.length, updated: 0 };
}

export default {
  getCard,
  findCardByCode,
  searchByName,
  getCardsByEdition,
  bulkUpsertCards,
};

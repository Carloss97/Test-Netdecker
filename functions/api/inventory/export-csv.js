import { pickDb, ensureSchema, buildSelectColumns, aliasSelectColumn } from '../../_shared/d1.js';

function csvQuote(v) {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    const scopeRaw = String(params.scope || 'all').toLowerCase();
    const scope = ['edition', 'tcg', 'all'].includes(scopeRaw) ? scopeRaw : 'all';
    const editionId = params.editionId || params.edition || null;
    const tcgId = params.tcgId || params.tcg || null;

    const db = pickDb(env);
    if (!db) return new Response(JSON.stringify({ success: false, error: 'No DB binding available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    await ensureSchema(db);

    // Build query to fetch inventory rows (join listing + card + edition when possible)
    // Use `buildSelectColumns` to avoid referencing missing columns on older D1 instances
    const listingCols = await buildSelectColumns(db, 'listing', 'l', ['id','cardId','editionCode','condition','quantity','referencePrice','marginMultiplier']);
    const cardCols = await buildSelectColumns(db, 'card', 'c', ['cardName','cardCode','cardNumber','rarity','tags','imageUrl','tcg']);

    // ensure aliases for listing id and editionCode
    let listingSelect = listingCols;
    listingSelect = aliasSelectColumn(listingSelect, 'l', 'id', 'listingId');
    listingSelect = aliasSelectColumn(listingSelect, 'l', 'editionCode', 'listingEditionCode');

    const selectParts = [];
    if (listingSelect) selectParts.push(listingSelect);
    if (cardCols) {
      // Safely alias c.tcg -> cardTcg using shared helper to avoid malformed SQL
      const cardColsAliased = aliasSelectColumn(cardCols, 'c', 'tcg', 'cardTcg');
      selectParts.push(cardColsAliased);
    }
    selectParts.push('e.editionName');

    let sql = `SELECT ${selectParts.join(', ')} FROM listing l
      LEFT JOIN card c ON l.cardId = c.id
      LEFT JOIN edition e ON (c.tcg = e.tcg AND c.editionCode = e.editionCode)
      WHERE 1=1`;
    const binds = [];

    if (scope === 'edition' && editionId) {
      // editionId may be 'TCG:CODE' or just CODE — attempt to match both
      if (editionId.includes(':')) {
        const [tcg, code] = editionId.split(':');
        sql += ' AND ((c.tcg = ? AND c.editionCode = ?) OR l.editionCode = ?)';
        binds.push(tcg, code, code);
      } else {
        sql += ' AND (c.editionCode = ? OR l.editionCode = ?)';
        binds.push(editionId, editionId);
      }
    } else if (scope === 'tcg' && tcgId) {
      sql += ' AND (c.tcg = ? OR l.cardId LIKE ?)';
      binds.push(tcgId, `${tcgId}:%`);
    }

    // Order by output aliases (avoid referencing physical columns that may be missing)
    sql += ' ORDER BY listingEditionCode ASC, cardCode ASC, condition ASC';

    let res;
    try {
      res = await db.prepare(sql).bind(...binds).all();
    } catch (err) {
      try { console.error('[export-csv] db query failed', err?.message || err, { sql, binds }); } catch (_) {}
      return new Response(JSON.stringify({ success: false, error: 'DB query failed', message: String(err && err.message ? err.message : err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);

    // Batch-fetch missing card metadata when join returned nulls
    const cardMap = new Map();
    const missingCardIds = Array.from(new Set(rows.filter((r) => !r.cardName && r.cardId).map((r) => r.cardId)));
    const chunk = (arr, size) => { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; };
    if (missingCardIds.length > 0) {
      const cardIdCols = await buildSelectColumns(db, 'card', 'c', ['id','cardName','cardCode','cardNumber','rarity','tags','imageUrl','tcg']);
      for (const cids of chunk(missingCardIds, 50)) {
        try {
          const placeholders = cids.map(() => '?').join(',');
          const sel = await db.prepare(`SELECT ${cardIdCols} FROM card c WHERE c.id IN (${placeholders})`).bind(...cids).all();
          const rowsRes = Array.isArray(sel?.results) ? sel.results : (Array.isArray(sel) ? sel : []);
          for (const cr of rowsRes) cardMap.set(cr.id || cr.ID || cr.Id || cr.id, cr);
        } catch (_) {}
      }
    }

    const header = ['tcg','editionCode','editionName','cardCode','cardName','cardNumber','rarity','tags','imageUrl','condition','quantity','referencePrice','marginMultiplier'];
    const lines = [header.map(csvQuote).join(',')];

    for (const r of rows) {
      // try to fill missing card info from batch fetch
      let card = null;
      if (!r.cardName && r.cardId) card = cardMap.get(r.cardId) || null;

      const tcg = (r.cardTcg || (card && card.tcg) || (r.cardId ? String(r.cardId).split(':')[0] : ''));
      const editionCode = r.listingEditionCode || '';
      const editionName = r.editionName || '';
      const cardCode = r.cardCode || (card && card.cardCode) || (r.cardId ? String(r.cardId).split(':').slice(-1)[0] : '');
      const cardName = r.cardName || (card && card.cardName) || '';
      const cardNumber = r.cardNumber || (card && card.cardNumber) || '';
      const rarity = r.rarity || (card && card.rarity) || '';
      const tags = r.tags || (card && card.tags) || '';
      const imageUrl = r.imageUrl || (card && card.imageUrl) || '';
      const condition = r.condition || 'NM';
      const quantity = String(r.quantity ?? 0);
      const referencePrice = String(r.referencePrice ?? '');
      const marginMultiplier = String(r.marginMultiplier ?? '');

      const cols = [tcg, editionCode, editionName, cardCode, cardName, cardNumber, rarity, tags, imageUrl, condition, quantity, referencePrice, marginMultiplier];
      lines.push(cols.map(csvQuote).join(','));
    }

    const csv = lines.join('\r\n');
    const fileName = scope === 'edition' ? `inventory-edition-${editionId || 'unknown'}.csv` : scope === 'tcg' ? `inventory-tcg-${tcgId || 'unknown'}.csv` : 'inventory-all.csv';

    return new Response(csv, { status: 200, headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="${fileName}"` } });
  } catch (err) {
    try { console.error('[export-csv] unexpected error', err && err.stack ? err.stack : err); } catch (_) {}
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

import { pickDb, ensureSchema } from '../../_shared/d1.js';
import { getUSDtoCLPRateMetaFast } from '../../_shared/exchange-rate.js';
import { incr, startTimer } from '../../_shared/metrics.js';

function normalizeHeader(header) {
  return header.replace(/^\uFEFF/, '').trim();
}

function parseCsvRecords(content) {
  const records = [];
  let currentRow = [];
  let currentValue = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentValue += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentValue.trim());
      currentValue = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i += 1;
      currentRow.push(currentValue.trim());
      if (currentRow.some((c) => c.length > 0)) records.push(currentRow);
      currentRow = [];
      currentValue = '';
      continue;
    }

    currentValue += char;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue.trim());
    if (currentRow.some((c) => c.length > 0)) records.push(currentRow);
  }

  return records;
}

function parseCsv(content) {
  const records = parseCsvRecords(content);
  if (records.length < 2) return [];
  const headers = records[0].map((h) => normalizeHeader(h));
  return records.slice(1).map((values) => {
    const row = {};
    headers.forEach((header, idx) => { row[header] = values[idx] || ''; });
    return row;
  });
}

function detectImportMode(rows) {
  if (!rows.length) throw new Error('CSV has no data rows');
  const headers = Object.keys(rows[0]);
  const listingHeaders = ['listingId', 'quantity'];
  const upsertRequired = ['tcg', 'editionCode', 'cardCode', 'cardName', 'quantity', 'referencePrice'];
  const hasListing = listingHeaders.every((h) => headers.includes(h));
  if (hasListing) return 'listing-update';
  const hasUpsert = upsertRequired.every((h) => headers.includes(h));
  if (hasUpsert) return 'full-upsert';
  throw new Error('Invalid CSV headers');
}

function parseNumber(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

function uuid() { if (globalThis.crypto && globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID(); return `L-${Date.now()}-${Math.floor(Math.random()*100000)}`; }

export async function onRequest(context) {
  const { request, env } = context;
  const stopTimer = startTimer('import_csv_duration_seconds');
  try {
    try { incr('import_csv_total', {}, 1); } catch (_) {}
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json', Allow: 'POST' } });
    }

    const form = await request.formData();
    const file = form.get('file');
    if (!file) return new Response(JSON.stringify({ success: false, error: 'File is required in form-data key "file"' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const dryRun = String(form.get('dryRun') || '').toLowerCase() === 'true';
    const importedBy = String(form.get('importedBy') || 'admin');

    const buf = await file.arrayBuffer();
    const text = new TextDecoder().decode(buf);

    const mappingRaw = form.get('mapping');
    let content = text;
    if (mappingRaw) {
      try {
        const mapping = typeof mappingRaw === 'string' ? JSON.parse(mappingRaw) : mappingRaw;
        // apply simple mapping: rename headers according to mapping
        const records = parseCsvRecords(content);
        if (records.length) {
          const rawHeaders = records[0].map((h) => normalizeHeader(h));
          const reverse = {};
          Object.keys(mapping || {}).forEach((k) => { const v = mapping[k]; if (v) reverse[normalizeHeader(v)] = k; });
          const newHeaders = rawHeaders.map((h) => reverse[h] || h);
          const headerLine = newHeaders.map((v) => (v.includes(',') || v.includes('"') ? '"' + v.replace(/"/g,'""') + '"' : v)).join(',');
          const bodyLines = records.slice(1).map((cols) => cols.map((v) => '"' + String(v).replace(/"/g,'""') + '"').join(',')).join('\n');
          content = headerLine + (bodyLines ? '\n' + bodyLines : '');
        }
      } catch (_) {}
    }

    const rows = parseCsv(content);
    const mode = detectImportMode(rows);

    // record rows count now that we parsed CSV
    try { incr('import_csv_rows_total', {}, rows.length); } catch (_) {}

    // Precheck option: return recommended chunk size and estimated binds instead of performing import
    const precheckRaw = form.get('precheck') || form.get('estimate') || null;
    const precheck = String(precheckRaw || '').toLowerCase() === 'true' || String(precheckRaw || '').toLowerCase() === '1' || String(precheckRaw || '').toLowerCase() === 'yes';
    const SQLITE_MAX_VARS = 900; // consistent with batching below
    const estimatedBindsPerRow = 12; // heuristic used elsewhere
    const recommendedChunkSize = Math.max(1, Math.floor(SQLITE_MAX_VARS / estimatedBindsPerRow));
    if (precheck) {
      return new Response(JSON.stringify({ success: true, rows: rows.length, estimatedBindsPerRow, recommendedChunkSize, message: `Chunk your CSV into sizes of ${recommendedChunkSize} rows for safe imports (server will also auto-chunk large uploads)` }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const db = pickDb(env);
    if (!db) {
      // In no-DB mode, only validate or return inspection
      const result = { total: rows.length, success: 0, failed: 0, errors: [], mode, dryRun: !!dryRun };
      for (let i = 0; i < rows.length; i++) {
        try { if (mode === 'listing-update') { if (!rows[i].listingId) throw new Error('Missing listingId'); } else { if (!rows[i].tcg) throw new Error('Missing tcg'); } result.success += 1; } catch (err) { result.failed += 1; result.errors.push({ row: i+2, message: String(err) }); }
      }
      return new Response(JSON.stringify({ success: true, validationOnly: dryRun, result }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    await ensureSchema(db);

    // Prefer cached exchange rate from appConfig when available (fast path)
    let usdToClp = Number(env.MANUAL_USD_TO_CLP || env.VITE_MANUAL_USD_TO_CLP || env.FALLBACK_USD_TO_CLP || 950);
    try {
      if (db) {
        const meta = await getUSDtoCLPRateMetaFast(env, db);
        if (meta && Number.isFinite(Number(meta.usdToCLP)) && Number(meta.usdToCLP) > 0) usdToClp = Number(meta.usdToCLP);
      }
    } catch (_) {
      // fall back to env value
    }

    const result = { total: rows.length, success: 0, failed: 0, errors: [], mode, dryRun: !!dryRun };

    // If listing-update mode just run small per-row updates (cheap)
    if (mode === 'listing-update') {
      for (let i = 0; i < rows.length; i++) {
        const rowNumber = i + 2;
        const listingId = String(rows[i].listingId || '').trim();
        if (!listingId) {
          result.failed += 1;
          result.errors.push({ row: rowNumber, message: 'Missing listingId' });
          continue;
        }
        if (!dryRun) {
          try {
            const q = Number(rows[i].quantity || 0) || 0;
            await db.prepare('UPDATE listing SET quantity = ?, everHadStock = CASE WHEN ? > 0 THEN 1 ELSE everHadStock END WHERE id = ?').bind(q, q, listingId).run();
            result.success += 1;
            incr('import_csv_success_total', {}, 1);
          } catch (err) {
            result.failed += 1;
            result.errors.push({ row: rowNumber, message: (err && err.message) || String(err) });
            incr('import_csv_failed_total', {}, 1);
          }
        } else {
          result.success += 1;
        }
      }
      return new Response(JSON.stringify({ success: true, result }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // full-upsert batching logic
    const chunk = (arr, size) => { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; };

    // Helpers for batched inserts (inspired by functions/api/external/import/set.js)
    const runBatchedInsert = async (tableCols, rowsToInsert, orReplace = false, orIgnore = false) => {
      if (!rowsToInsert || rowsToInsert.length === 0) return;
      const colCount = tableCols.cols.length;
      const safeBatch = Math.max(1, Math.floor(SQLITE_MAX_VARS / Math.max(1, colCount)));

      const batches = chunk(rowsToInsert, safeBatch);
      for (const batch of batches) {
        const placeholders = batch.map(() => `(${new Array(colCount).fill('?').join(',')})`).join(',');
        const sql = `INSERT ${orReplace ? 'OR REPLACE' : orIgnore ? 'OR IGNORE' : ''} INTO ${tableCols.table} (${tableCols.cols.join(',')}) VALUES ${placeholders};`;
        const params = batch.flat();
        try {
          await db.prepare(sql).bind(...params).run();
        } catch (e) {
          // If batch fails, try per-row insert to salvage what we can
          for (const row of batch) {
            const rowPlaceholders = `(${new Array(colCount).fill('?').join(',')})`;
            const rowSql = `INSERT ${orReplace ? 'OR REPLACE' : orIgnore ? 'OR IGNORE' : ''} INTO ${tableCols.table} (${tableCols.cols.join(',')}) VALUES ${rowPlaceholders};`;
            try { await db.prepare(rowSql).bind(...row).run(); } catch (_) { /* ignore per-row error */ }
          }
        }
      }
    };

    // Process rows in safe-size batches to avoid large prepared statements
    const safeRowBatch = Math.max(1, Math.floor(SQLITE_MAX_VARS / 12)); // heuristic: ~12 binds per CSV row on average
    for (const rowsBatch of chunk(rows, safeRowBatch)) {
      // Collect unique editions and card/listing rows for this batch
      const editionToInsert = new Map();
      const cardRows = [];
      const listingRows = [];
      const priceHistoryRows = [];
      const listingUpdates = [];

      // Build list of cardIds we need to prefetch
      const cardIds = [];
      for (const row of rowsBatch) {
        const tcg = String(row.tcg || '').trim().toUpperCase();
        const editionCode = String(row.editionCode || '').trim();
        const cardCode = String(row.cardCode || '').trim();
        if (!tcg || !editionCode || !cardCode) continue;
        const cardId = `${tcg}:${editionCode}:${cardCode}`;
        cardIds.push(cardId);
      }

      // Prefetch existing cards and listings for this batch
      const existingCards = new Set();
      for (const cids of chunk(cardIds, 50)) {
        const placeholders = cids.map(() => '?').join(',');
        try {
          const sel = await db.prepare(`SELECT id FROM card WHERE id IN (${placeholders})`).bind(...cids).all();
          const rowsRes = Array.isArray(sel?.results) ? sel.results : (Array.isArray(sel) ? sel : []);
          for (const r of rowsRes) existingCards.add(r.id || r.ID || r.id);
        } catch (_) {}
      }

      // Prefetch listings for this edition/card combos
      // We'll query listings by editionCode + cardId IN (...) to build lookup
      const listingLookup = new Map();
      const editionCodes = new Set(rowsBatch.map((r) => String(r.editionCode || '').trim()).filter(Boolean));
      for (const editionCode of Array.from(editionCodes)) {
        const cids = cardIds.filter((id) => id.includes(`:${editionCode}:`));
        for (const chunked of chunk(cids, 50)) {
          const placeholders = chunked.map(() => '?').join(',');
          try {
            const sel = await db.prepare(`SELECT id, cardId, condition, rarity FROM listing WHERE editionCode = ? AND cardId IN (${placeholders})`).bind(editionCode, ...chunked).all();
            const rowsRes = Array.isArray(sel?.results) ? sel.results : (Array.isArray(sel) ? sel : []);
            for (const r of rowsRes) {
              const key = `${r.cardId}|${editionCode}|${r.condition || ''}|${r.rarity || ''}`;
              listingLookup.set(key, r.id || r.ID || r.id);
            }
          } catch (_) {}
        }
      }

      // Now generate rows for inserts/updates
      for (let i = 0; i < rowsBatch.length; i++) {
        const row = rowsBatch[i];
        const rowNumber = 2 + i;
        try {
          const tcg = String(row.tcg || '').trim().toUpperCase();
          const editionCode = String(row.editionCode || '').trim();
          const editionName = String(row.editionName || editionCode || '').trim();
          const cardCode = String(row.cardCode || '').trim();
          const cardName = String(row.cardName || '').trim();
          const quantity = Number(row.quantity || 0) || 0;
          const referencePrice = parseNumber(row.referencePrice) || 0;
          const marginMultiplier = parseNumber(row.marginMultiplier) || Number(env.DEFAULT_MARGIN_MULTIPLIER || env.VITE_DEFAULT_MARGIN_MULTIPLIER || 1.2);
          const condition = String(row.condition || 'NM').trim() || 'NM';
          const rarity = String(row.rarity || 'Unknown').trim() || 'Unknown';
          const cardNumber = String(row.cardNumber || row.cardCode || '').trim() || null;
          const imageUrl = row.imageUrl ? String(row.imageUrl).trim() : null;

          if (!tcg || !editionCode || !cardCode || !cardName) throw new Error('Missing required fields for upsert');

          if (dryRun) { result.success += 1; continue; }

          const editionId = `${tcg}:${editionCode}`;
          if (!editionToInsert.has(editionId)) {
            editionToInsert.set(editionId, [editionId, tcg, editionCode, editionName, null, 1]);
          }

          const cardId = `${tcg}:${editionCode}:${cardCode}`;
          cardRows.push([cardId, cardCode, tcg, editionCode, cardCode, cardName, cardNumber, rarity, imageUrl, referencePrice > 0 ? referencePrice : null]);

          const exchangeRate = usdToClp;
          const finalPrice = Math.round(referencePrice * marginMultiplier * exchangeRate);

          const listingKey = `${cardId}|${editionCode}|${condition}|${rarity}`;
          const existingListingId = listingLookup.get(listingKey);
          if (existingListingId) {
            // prepare update
            listingUpdates.push({ id: existingListingId, quantity, referencePrice, marginMultiplier, exchangeRate, finalPrice, editionCode });
          } else {
            const listingId = uuid();
            listingRows.push([listingId, cardId, editionCode, condition, rarity, quantity, referencePrice, marginMultiplier, exchangeRate, finalPrice, 'CLP', 'active', new Date().toISOString(), new Date().toISOString()]);
            const phId = (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) || `ph-${Date.now()}-${Math.floor(Math.random()*10000)}`;
            priceHistoryRows.push([phId, listingId, null, finalPrice, null, referencePrice, null, exchangeRate, 'initial_import', null, importedBy, 'import', new Date().toISOString()]);
          }

          result.success += 1;
          // count per-row success for imports
          try { incr('import_csv_success_total', {}, 1); } catch (_) {}
        } catch (err) {
          result.failed += 1;
          try { incr('import_csv_failed_total', {}, 1); } catch (_) {}
          result.errors.push({ row: rowNumber, message: (err && err.message) || String(err) });
        }
      }

      // perform batched inserts/updates for this batch
      if (!dryRun) {
        // editions
        const editionRows = Array.from(editionToInsert.values());
        if (editionRows.length > 0) {
          await runBatchedInsert({ table: 'edition', cols: ['id','tcg','editionCode','editionName','releaseDate','isActive'] }, editionRows, true, false);
        }

        // cards (upsert)
        if (cardRows.length > 0) {
          await runBatchedInsert({ table: 'card', cols: ['id','externalId','tcg','editionCode','cardCode','cardName','cardNumber','rarity','imageUrl','priceMarket'] }, cardRows, true, false);
        }

        // listing updates
        for (const u of listingUpdates) {
          try {
            await db.prepare('UPDATE listing SET quantity = ?, referencePrice = ?, marginMultiplier = ?, exchangeRate = ?, finalPrice = ?, editionCode = ?, currency = ?, status = ?, updatedAt = ? WHERE id = ?')
              .bind(u.quantity, u.referencePrice, u.marginMultiplier, u.exchangeRate, u.finalPrice, u.editionCode, 'CLP', 'active', new Date().toISOString(), u.id).run();
          } catch (_) {}
        }

        // insert new listings and price history
        if (listingRows.length > 0) {
          await runBatchedInsert({ table: 'listing', cols: ['id','cardId','editionCode','condition','rarity','quantity','referencePrice','marginMultiplier','exchangeRate','finalPrice','currency','status','createdAt','updatedAt'] }, listingRows, false, true);
        }

        if (priceHistoryRows.length > 0) {
          await runBatchedInsert({ table: 'priceHistory', cols: ['id','listingId','oldPrice','newPrice','oldReferencePrice','newReferencePrice','oldExchangeRate','newExchangeRate','reason','percentChange','changedBy','notes','createdAt'] }, priceHistoryRows, false, false);
        }
      }
    }

    try { stopTimer(); } catch (_) {}
    return new Response(JSON.stringify({ success: true, result }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    try { stopTimer(); } catch (_) {}
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

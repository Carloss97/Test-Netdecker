import { pickDb, ensureSchema, firstRow, buildSelectColumns } from '../../_shared/d1.js';

// Admin utility: detect listings referencing missing cards and attempt safe fixes.
export async function onRequest(context) {
  const { request, env } = context;
  const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
  try {
    if (request.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);
    const body = await request.json().catch(() => ({}));
    const doRun = body && (body.confirm === true || String(body.confirm).toLowerCase() === 'yes' || String(body.confirm).toLowerCase() === 'run');

    const db = pickDb(env);
    if (!db) return json({ success: false, error: 'No DB binding available' }, 500);
    await ensureSchema(db);

    // precompute safe select for card id to avoid referencing missing columns
    const cardIdSelect = await buildSelectColumns(db, 'card', 'c', ['id']);

    // Find listings whose cardId does not have a matching card row
    const orphanRes = await db.prepare('SELECT l.id as listingId, l.cardId, l.editionCode FROM listing l LEFT JOIN card c ON l.cardId = c.id WHERE c.id IS NULL LIMIT 1000').all();
    const orphanRows = Array.isArray(orphanRes?.results) ? orphanRes.results : (Array.isArray(orphanRes) ? orphanRes : []);
    const plans = [];

    for (const r of orphanRows) {
      const listingId = r.listingId || r.ID || r.id;
      const cardId = String(r.cardId || '');
      const editionCode = String(r.editionCode || '');

      // heuristics: try externalId, cardCode, or partial matches
      const parts = cardId.split(':').filter(Boolean);
      let candidates = [];
      try {
        if (parts.length >= 2) {
          const maybe = parts[parts.length - 1];
          // try externalId
          const ext = await db.prepare(`SELECT ${cardIdSelect} FROM card c WHERE c.externalId = ? LIMIT 1`).bind(maybe).all();
          const extRow = firstRow(ext);
          if (extRow && extRow.id) candidates.push(extRow.id);

          // try cardCode + edition
          const code = await db.prepare(`SELECT ${cardIdSelect} FROM card c WHERE c.cardCode = ? AND c.editionCode = ? LIMIT 1`).bind(maybe, editionCode).all();
          const codeRow = firstRow(code);
          if (codeRow && codeRow.id) candidates.push(codeRow.id);

          // try full id match if different separators
          const full = await db.prepare(`SELECT ${cardIdSelect} FROM card c WHERE c.id = ? LIMIT 1`).bind(cardId).all();
          const fullRow = firstRow(full);
          if (fullRow && fullRow.id) candidates.push(fullRow.id);
        }

        // broader name match fallback: last 10 chars in cardName
        const last = cardId.slice(-10);
        const nameMatch = await db.prepare(`SELECT ${cardIdSelect} FROM card c WHERE c.cardName LIKE ? LIMIT 1`).bind(`%${last}%`).all();
        const nameRow = firstRow(nameMatch);
        if (nameRow && nameRow.id) candidates.push(nameRow.id);
      } catch (_) {}

      const unique = Array.from(new Set(candidates));
      if (unique.length > 0) {
        plans.push({ listingId, cardId, found: unique[0], candidates: unique });
      } else {
        plans.push({ listingId, cardId, found: null, candidates: [] });
      }
    }

    const report = { totalOrphans: orphanRows.length, plans: plans.slice(0, 200) };

    if (!doRun) return json({ success: true, report, note: 'Dry run. POST { confirm: true } to apply changes.' });

    // Apply updates
    const applied = [];
    for (const p of plans) {
      if (p.found) {
        try {
          await db.prepare('UPDATE listing SET cardId = ?, updatedAt = ? WHERE id = ?').bind(p.found, new Date().toISOString(), p.listingId).run();
          applied.push({ listingId: p.listingId, updatedTo: p.found });
        } catch (err) {
          // ignore individual failures
        }
      }
    }

    return json({ success: true, report: { ...report, applied }, appliedCount: applied.length });
  } catch (err) {
    return json({ success: false, error: String(err) }, 500);
  }
}

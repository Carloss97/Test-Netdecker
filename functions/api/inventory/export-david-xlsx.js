import ExcelJS from 'exceljs';
import { pickDb, ensureSchema } from '../../_shared/d1.js';

function parseScope(url) {
  const q = new URL(url).searchParams;
  const scopeRaw = String(q.get('scope') || 'all').toLowerCase();
  const scope = ['edition', 'tcg', 'all'].includes(scopeRaw) ? scopeRaw : 'all';
  const editionId = q.get('editionId') || undefined;
  const tcgId = q.get('tcgId') || undefined;
  return { scope, editionId, tcgId };
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const db = pickDb(env);
    if (!db) return new Response('No DB binding available', { status: 500 });
    await ensureSchema(db);

    const q = parseScope(request.url);
    const where = [];
    const binds = [];
    if (q.scope === 'edition' && q.editionId) {
      where.push('l.editionCode = ?'); binds.push(q.editionId);
    } else if (q.scope === 'tcg' && q.tcgId) {
      where.push('c.tcg = ?'); binds.push(q.tcgId);
    }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const sql = `SELECT l.id AS listingId, l.editionCode, l.quantity, l.referencePrice, l.marginMultiplier, c.cardCode, c.cardName, c.cardNumber, l.rarity, l.condition
      FROM listing l LEFT JOIN card c ON l.cardId = c.id ${whereSql} ORDER BY l.editionCode, c.cardName`;
    const res = await db.prepare(sql).bind(...binds).all();
    const rows = Array.isArray(res?.results) ? res.results : (Array.isArray(res) ? res : []);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Inventory');
    const header = ['tcg', 'editionCode', 'cardCode', 'cardName', 'cardNumber', 'condition', 'rarity', 'quantity', 'referencePrice', 'marginMultiplier'];
    sheet.addRow(header);

    for (const r of rows) {
      sheet.addRow([
        r.tcg || '',
        r.editionCode || '',
        r.cardCode || '',
        r.cardName || '',
        r.cardNumber || '',
        r.condition || '',
        r.rarity || '',
        Number(r.quantity || 0),
        Number(r.referencePrice || 0),
        Number(r.marginMultiplier || 1),
      ]);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(buffer, { status: 200, headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="inventory-export.xlsx"' } });
  } catch (err) {
    return new Response(String(err), { status: 500 });
  }
}

export default onRequest;

import { pickDb, ensureSchema } from '../../../_shared/d1.js';

function normalizeHeader(header) { return header.replace(/^\uFEFF/, '').trim(); }
function parseCsvRecords(content) {
  const records = [];
  let currentRow = [];
  let currentValue = '';
  let inQuotes = false;
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i+1];
    if (char === '"') { if (inQuotes && next === '"') { currentValue += '"'; i += 1; } else { inQuotes = !inQuotes; } continue; }
    if (char === ',' && !inQuotes) { currentRow.push(currentValue.trim()); currentValue = ''; continue; }
    if ((char === '\n' || char === '\r') && !inQuotes) { if (char === '\r' && next === '\n') i += 1; currentRow.push(currentValue.trim()); if (currentRow.some(c => c.length>0)) records.push(currentRow); currentRow = []; currentValue = ''; continue; }
    currentValue += char;
  }
  if (currentValue.length > 0 || currentRow.length > 0) { currentRow.push(currentValue.trim()); if (currentRow.some(c=>c.length>0)) records.push(currentRow); }
  return records;
}
function parseCsv(content) {
  const recs = parseCsvRecords(content);
  if (recs.length < 2) return [];
  const headers = recs[0].map(h => normalizeHeader(h));
  return recs.slice(1).map(vals => { const r = {}; headers.forEach((h, idx) => r[h] = vals[idx] || ''); return r; });
}

function detectMode(rows) {
  if (!rows.length) throw new Error('CSV has no data rows');
  const headers = Object.keys(rows[0]);
  if (['listingId','quantity'].every(h=>headers.includes(h))) return 'listing-update';
  if (['tcg','editionCode','cardCode','cardName','quantity','referencePrice'].every(h=>headers.includes(h))) return 'full-upsert';
  throw new Error('Invalid CSV headers');
}

export async function onRequest(context) {
  const { request, env } = context;
  try {
    if (request.method !== 'POST') return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type':'application/json' } });
    const form = await request.formData();
    const file = form.get('file');
    if (!file) return new Response(JSON.stringify({ success:false, error: 'File is required' }), { status:400, headers:{ 'Content-Type':'application/json' } });
    const buf = await file.arrayBuffer();
    const text = new TextDecoder().decode(buf);
    const mappingRaw = form.get('mapping');
    let content = text;
    if (mappingRaw) {
      try {
        const mapping = typeof mappingRaw === 'string' ? JSON.parse(mappingRaw) : mappingRaw;
        const records = parseCsvRecords(content);
        if (records.length) {
          const rawHeaders = records[0].map(h=>normalizeHeader(h));
          const reverse = {};
          Object.keys(mapping||{}).forEach(k=>{ const v = mapping[k]; if (v) reverse[normalizeHeader(v)] = k; });
          const newHeaders = rawHeaders.map(h=>reverse[h]||h);
          const headerLine = newHeaders.map(v=> (v.includes(',')||v.includes('"')? '"'+v.replace(/"/g,'""')+'"':v)).join(',');
          const body = records.slice(1).map(cols=>cols.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
          content = headerLine + (body? '\n'+body: '');
        }
      } catch(_){}
    }
    const rows = parseCsv(content);
    const mode = detectMode(rows);
    // Basic validation pass
    const result = { total: rows.length, success: 0, failed: 0, errors: [], mode, validationOnly: true };
    for (let i=0;i<rows.length;i++){
      try {
        if (mode === 'listing-update') { if (!rows[i].listingId) throw new Error('Missing listingId'); const q = Number(rows[i].quantity||0); if (!Number.isFinite(q)) throw new Error('Invalid quantity'); }
        else { if (!rows[i].tcg) throw new Error('Missing tcg'); if (!rows[i].cardCode) throw new Error('Missing cardCode'); const rp = Number(rows[i].referencePrice||0); if (!Number.isFinite(rp)) throw new Error('Invalid referencePrice'); }
        result.success += 1;
      } catch (err) { result.failed += 1; result.errors.push({ row: i+2, message: (err && err.message) || String(err) }); }
    }
    return new Response(JSON.stringify({ success: true, result }), { status:200, headers:{ 'Content-Type':'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success:false, error: String(err) }), { status:500, headers:{ 'Content-Type':'application/json' } });
  }
}

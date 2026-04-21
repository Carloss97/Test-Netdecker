import { pickDb, ensureSchema } from '../../_shared/d1.js';

function html(body) {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const idsParam = url.searchParams.get('ids') || '';
  const gtinsParam = url.searchParams.get('gtins') || '';
  const qtysParam = url.searchParams.get('qtys') || '';

  const ids = idsParam ? idsParam.split(',').map(s => s.trim()).filter(Boolean) : [];
  const gtins = gtinsParam ? gtinsParam.split(',').map(s => s.trim()).filter(Boolean) : [];
  const qtys = qtysParam ? qtysParam.split(',').map(s => parseInt(s, 10) || 1) : [];

  let labels = [];
  const db = pickDb(env);
  if (db) await ensureSchema(db);

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    try {
      const res = await db.prepare('SELECT id, sku, gtin, finalPrice, referencePrice, title, quantity FROM listing WHERE id = ? LIMIT 1').bind(id).all();
      const row = Array.isArray(res?.results) ? res.results[0] : (Array.isArray(res) ? res[0] : null);
      if (row) {
        const count = qtys[i] || 1;
        for (let k = 0; k < count; k++) labels.push({ code: row.gtin || row.sku || row.id, title: row.sku || row.title || row.id, price: row.finalPrice || row.referencePrice || null });
      } else {
        // not found: push placeholder
        labels.push({ code: id, title: id, price: null });
      }
    } catch (err) {
      labels.push({ code: id, title: id, price: null });
    }
  }

  for (let i = 0; i < gtins.length; i++) {
    const g = gtins[i];
    try {
      const res = db ? await db.prepare('SELECT id, sku, gtin, finalPrice, referencePrice, title FROM listing WHERE gtin = ? LIMIT 1').bind(g).all() : null;
      const row = res ? (Array.isArray(res?.results) ? res.results[0] : (Array.isArray(res) ? res[0] : null)) : null;
      if (row) {
        const count = qtys[i] || 1;
        for (let k = 0; k < count; k++) labels.push({ code: row.gtin || row.sku || row.id, title: row.sku || row.title || row.id, price: row.finalPrice || row.referencePrice || null });
      } else {
        labels.push({ code: g, title: g, price: null });
      }
    } catch (err) {
      labels.push({ code: g, title: g, price: null });
    }
  }

  // Simple HTML with JsBarcode to render labels in a printable grid
  const htmlBody = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Etiquetas</title>
  <style>
    body{font-family: Arial, Helvetica, sans-serif; padding:12px}
    .labels{display:grid; grid-template-columns: repeat(3, 1fr); gap:12px}
    .label{border:1px solid #ddd; padding:8px; height:120px; box-sizing:border-box; display:flex; flex-direction:column; align-items:center; justify-content:center}
    .caption{margin-top:6px; font-size:12px; text-align:center}
    .price{font-weight:700; margin-top:6px}
    @media print{ .labels{gap:6px} .label{border: none} }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
</head>
<body>
  <h3>Etiquetas</h3>
  <div class="labels">
    ${labels.map((l, i) => `
      <div class="label">
        <svg id="bc-${i}" jsbarcode-value="${escapeHtml(l.code)}" width="180" height="48"></svg>
        <div class="caption">${escapeHtml(l.title)}</div>
        <div class="price">${l.price != null ? escapeHtml(String(l.price)) : ''}</div>
      </div>
    `).join('')}
  </div>
  <script>
    (function(){
      const nodes = document.querySelectorAll('svg[jsbarcode-value]');
      nodes.forEach(svg => {
        const code = svg.getAttribute('jsbarcode-value');
        try{ JsBarcode(svg, code, { format: 'ean13', displayValue: true, height: 40, width:1.4 }); }
        catch(e){ try{ JsBarcode(svg, code, { format:'CODE128', displayValue:true, height:40 }); } catch(_) { /* swallow */ } }
      });
    })();
  </script>
</body>
</html>`;

  return html(htmlBody);
}

export default onRequest;

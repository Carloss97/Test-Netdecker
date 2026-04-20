export async function onRequest(context) {
  const { request } = context;
  try {
    const url = new URL(request.url);
    const gtin = url.searchParams.get('gtin') || '';
    const id = url.searchParams.get('id') || '';

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Etiqueta</title>
  <style>body{font-family:Arial,Helvetica,sans-serif;padding:16px}#barcode{width:100%;max-width:420px;height:120px}</style>
</head>
<body>
  <h2>Etiqueta</h2>
  <div id="info">Cargando…</div>
  <svg id="barcode"></svg>
  <div style="margin-top:12px">
    <button id="print">Imprimir</button>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
  <script>
    (async function(){
      const params = new URLSearchParams(window.location.search);
      const gtin = params.get('gtin');
      const id = params.get('id');
      let code = gtin || id || '';
      let label = code;
      try {
        if (gtin) {
          const r = await fetch('/api/listings/gtin?gtin=' + encodeURIComponent(gtin));
          if (r.ok) {
            const d = await r.json();
            code = d.listing?.gtin || code;
            label = d.listing?.sku || (d.listing?.listingId || code);
          }
        } else if (id) {
          const r = await fetch('/api/listings/' + encodeURIComponent(id));
          if (r.ok) {
            const d = await r.json();
            const listing = d.listing || d;
            code = listing.gtin || listing.listingId || listing.id || code;
            label = listing.sku || listing.card?.cardName || listing.listingId || listing.id || code;
          }
        }
      } catch (err) {
        // ignore
      }
      document.getElementById('info').textContent = label + ' — ' + code;
      try {
        // try EAN13 first
        JsBarcode('#barcode', String(code), { format: 'EAN13', displayValue: true, fontSize: 18, height: 60 });
      } catch (e) {
        try { JsBarcode('#barcode', String(code), { format: 'CODE128', displayValue: true, fontSize: 14, height: 60 }); } catch (e2) { document.getElementById('info').textContent += ' (no readable)'; }
      }
      document.getElementById('print').addEventListener('click', function(){ window.print(); });
    })();
  </script>
</body>
</html>`;

    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (err) {
    return new Response(String(err), { status: 500 });
  }
}

export default onRequest;

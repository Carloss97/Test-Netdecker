const { SAMPLE_SETS } = require('../../_shared/sets');

function sendRaw(res, bodyText, status = 200, headers = {}) {
  try { if (typeof res.setHeader === 'function') res.setHeader('Content-Type', 'application/json'); } catch(_){ }
  try { if (typeof res.writeHead === 'function') res.writeHead(status); } catch(_){ }
  try { return res.end(bodyText); } catch(_){ }
}

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const params = new URLSearchParams(url.search);
    const cardset = params.get('cardset');

    if (cardset) {
      const up = String(cardset).toUpperCase();
      for (const tcgKey of Object.keys(SAMPLE_SETS)) {
        const found = (SAMPLE_SETS[tcgKey] || []).find((s) => String(s.set_code || '').toUpperCase() === up);
        if (found) {
          params.set('cardset', found.set_name);
          break;
        }
      }
    }

    const target = `https://db.ygoprodeck.com/api/v7/cardinfo.php?${params.toString()}`;

    if (typeof globalThis.fetch !== 'function') {
      return sendRaw(res, JSON.stringify({ success: false, error: 'Server fetch not available in runtime' }), 501);
    }

    const r = await globalThis.fetch(target, { method: 'GET' });
    const txt = await r.text();
    return sendRaw(res, txt, r.status, { 'Content-Type': r.headers.get('content-type') || 'application/json' });
  } catch (err) {
    return sendRaw(res, JSON.stringify({ success: false, error: String(err) }), 500);
  }
};

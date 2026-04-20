// PHP-style cardinfo endpoint wrapper
const { SAMPLE_SETS } = require('../../../_shared/sets.cjs');

module.exports = async function handler(req, res) {
  try {
    const url = req.url || '';
    const qs = (url.split('?')[1] || '');
    const params = new URLSearchParams(qs);
    const setCode = params.get('set_code') || params.get('set');
    let setName = params.get('set_name') || params.get('set');
    if (!setName && setCode) {
      if (setCode.toUpperCase() === 'RA05') setName = 'Rarity Collection 5';
      else {
        const found = (SAMPLE_SETS.YUGIOH || []).find((s) => s.set_code === setCode);
        if (found) setName = found.set_name;
      }
    }
    const data = { query: { set_code: setCode || null, set_name: setName || null }, cards: [] };
    try { if (typeof res.setHeader === 'function') res.setHeader('Content-Type', 'application/json'); } catch(_){ }
    try { if (typeof res.writeHead === 'function') res.writeHead(200); } catch(_){ }
    try { return res.end(JSON.stringify({ success: true, data })); } catch(_){ }
    res.statusCode = 200; res.end(JSON.stringify({ success: true, data }));
  } catch (err) {
    try { if (typeof res.setHeader === 'function') res.setHeader('Content-Type', 'application/json'); } catch(_){ }
    try { if (typeof res.writeHead === 'function') res.writeHead(500); } catch(_){ }
    try { return res.end(JSON.stringify({ success: false, error: String(err) })); } catch(_){ }
  }
};

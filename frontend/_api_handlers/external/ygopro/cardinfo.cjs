const { SAMPLE_SETS } = require('../../../_shared/sets.cjs');

function sendJson(res, payload, status = 200) {
  try { if (typeof res.setHeader === 'function') res.setHeader('Content-Type', 'application/json'); } catch(_){ }
  try { if (typeof res.writeHead === 'function') res.writeHead(status); } catch(_){ }
  try { return res.end(JSON.stringify(payload)); } catch(_){ }
}

module.exports = async function handler(req, res) {
  try {
    // This stub aims to emulate ygopro's cardinfo endpoint which accepts
    // either set code or set name. Some callers send set_code=RA05; ygopro
    // expects a set name for some queries. We map RA05 -> 'Rarity Collection 5'.
    const url = req.url || '';
    const qs = (url.split('?')[1] || '');
    const params = new URLSearchParams(qs);
    const setCode = params.get('set_code') || params.get('set');
    let setName = params.get('set_name') || params.get('set');
    if (!setName && setCode) {
      // map known sample code RA05 to a name
      if (setCode.toUpperCase() === 'RA05') setName = 'Rarity Collection 5';
      else {
        const found = (SAMPLE_SETS.YUGIOH || []).find((s) => s.set_code === setCode);
        if (found) setName = found.set_name;
      }
    }

    // Return a small cardinfo payload describing the requested set.
    const data = { query: { set_code: setCode || null, set_name: setName || null }, cards: [] };
    return sendJson(res, { success: true, data }, 200);
  } catch (err) {
    return sendJson(res, { success: false, error: String(err) }, 500);
  }
};

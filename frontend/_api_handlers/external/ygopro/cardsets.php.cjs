// PHP-style endpoint emulation for ygopro cardsets.php
const { SAMPLE_SETS } = require('../../../_shared/sets.cjs');

module.exports = async function handler(req, res) {
  try {
    const yugioh = (SAMPLE_SETS.YUGIOH || []).map((s) => ({ set_code: s.set_code, set_name: s.set_name }));
    try { if (typeof res.setHeader === 'function') res.setHeader('Content-Type', 'application/json'); } catch(_){ }
    try { if (typeof res.writeHead === 'function') res.writeHead(200); } catch(_){ }
    try { return res.end(JSON.stringify({ success: true, total: yugioh.length, data: yugioh })); } catch(_){ }
    res.statusCode = 200; res.end(JSON.stringify({ success: true, total: yugioh.length, data: yugioh }));
  } catch (err) {
    try { if (typeof res.setHeader === 'function') res.setHeader('Content-Type', 'application/json'); } catch(_){ }
    try { if (typeof res.writeHead === 'function') res.writeHead(500); } catch(_){ }
    try { return res.end(JSON.stringify({ success: false, error: String(err) })); } catch(_){ }
  }
};

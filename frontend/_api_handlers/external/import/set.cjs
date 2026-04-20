const { SAMPLE_SETS } = require('../../../_shared/sets.cjs');

module.exports = async function handler(req, res) {
  try {
    // Accepts a set import request. We'll echo the sample sets.
    const payload = Object.keys(SAMPLE_SETS).reduce((acc, tcg) => {
      acc[tcg] = SAMPLE_SETS[tcg];
      return acc;
    }, {});
    try { if (typeof res.setHeader === 'function') res.setHeader('Content-Type', 'application/json'); } catch(_){ }
    try { if (typeof res.writeHead === 'function') res.writeHead(200); } catch(_){ }
    try { return res.end(JSON.stringify({ success: true, imported: true, sets: payload })); } catch(_){ }
    res.statusCode = 200; res.end(JSON.stringify({ success: true, imported: true, sets: payload }));
  } catch (err) {
    try { if (typeof res.setHeader === 'function') res.setHeader('Content-Type', 'application/json'); } catch(_){ }
    try { if (typeof res.writeHead === 'function') res.writeHead(500); } catch(_){ }
    try { return res.end(JSON.stringify({ success: false, error: String(err) })); } catch(_){ }
  }
};

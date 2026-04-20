const { SAMPLE_SETS } = require('../../_shared/sets.cjs');

module.exports = async function handler(req, res) {
  try {
    // Return combined sets for all TCGs in sample data
    const all = [];
    for (const k of Object.keys(SAMPLE_SETS || {})) {
      for (const s of SAMPLE_SETS[k]) {
        all.push(Object.assign({ tcg: k }, s));
      }
    }
    try { if (typeof res.setHeader === 'function') res.setHeader('Content-Type', 'application/json'); } catch(_){ }
    try { if (typeof res.writeHead === 'function') res.writeHead(200); } catch(_){ }
    try { return res.end(JSON.stringify({ success: true, total: all.length, sets: all })); } catch(_){ }
    res.statusCode = 200; res.end(JSON.stringify({ success: true, total: all.length, sets: all }));
  } catch (err) {
    try { if (typeof res.setHeader === 'function') res.setHeader('Content-Type', 'application/json'); } catch(_){ }
    try { if (typeof res.writeHead === 'function') res.writeHead(500); } catch(_){ }
    try { return res.end(JSON.stringify({ success: false, error: String(err) })); } catch(_){ }
  }
};

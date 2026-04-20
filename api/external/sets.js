const { URL } = require('url');

function sendJson(res, payload, status = 200) {
  if (res && typeof res.json === 'function') {
    if (typeof res.status === 'function') res.status(status);
    return res.json(payload);
  }
  try {
    if (typeof res.setHeader === 'function') res.setHeader('Content-Type', 'application/json');
    if (typeof res.writeHead === 'function') res.writeHead(status);
    if (typeof res.end === 'function') return res.end(JSON.stringify(payload));
  } catch (err) {}
  try { res.statusCode = status; res.end(JSON.stringify(payload)); } catch (_) {}
}

const SAMPLE_SETS = {
  YUGIOH: [
    { set_code: 'RA05', set_name: 'Rarity Collection 5' },
    { set_code: 'MP20', set_name: 'Mystic Pack 2020' },
  ],
  MAGIC: [
    { set_code: 'ZN', set_name: 'Zendikar' },
  ],
};

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const tcg = (url.searchParams.get('tcg') || '').toUpperCase() || 'YUGIOH';
    const sets = SAMPLE_SETS[tcg] || [];
    return sendJson(res, { success: true, total: sets.length, sets }, 200);
  } catch (err) {
    return sendJson(res, { success: false, error: String(err) }, 500);
  }
};

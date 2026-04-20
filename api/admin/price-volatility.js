const { URL } = require('url');

const DEFAULT_SAMPLE = [
  { id: 'CARD-001', volatility: 0.12 },
  { id: 'CARD-002', volatility: 0.08 },
  { id: 'CARD-003', volatility: 0.03 },
];

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

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit') || '20', 10)));
    const window = url.searchParams.get('window') || '7d';

    const data = DEFAULT_SAMPLE.slice(0, limit).map((d, i) => ({
      id: d.id,
      volatility: d.volatility,
      window,
    }));

    return sendJson(res, { success: true, total: data.length, data }, 200);
  } catch (err) {
    return sendJson(res, { success: false, error: String(err) }, 500);
  }
};

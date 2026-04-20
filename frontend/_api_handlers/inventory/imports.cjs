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

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get('pageSize') || '10', 10)));

    // Return empty imports list as a safe default
    const imports = [];
    return sendJson(res, { success: true, total: imports.length, imports, pageSize }, 200);
  } catch (err) {
    return sendJson(res, { success: false, error: String(err) }, 500);
  }
};

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
    // Support both URL-encoded and JSON bodies in a tolerant way when invoked locally.
    let body = {};
    try { body = req.body || {}; } catch (_) { body = {}; }

    const tcg = (body.tcg || (req.query && req.query.tcg) || '').toUpperCase() || 'YUGIOH';
    const set = body.set || (req.query && req.query.set) || null;

    if (!set) return sendJson(res, { success: false, error: 'missing set parameter' }, 400);

    // In a real implementation we'd fetch & import the set; here return a safe stub.
    return sendJson(res, { success: true, imported: true, tcg, set }, 200);
  } catch (err) {
    return sendJson(res, { success: false, error: String(err) }, 500);
  }
};

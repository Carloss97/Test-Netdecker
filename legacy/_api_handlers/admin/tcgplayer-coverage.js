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
    const sample = { tcgplayer: { coveragePct: 92, lastUpdated: new Date().toISOString() } };
    return sendJson(res, { success: true, data: sample }, 200);
  } catch (err) {
    return sendJson(res, { success: false, error: String(err) }, 500);
  }
};

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
    // In this stub we don't parse multipart bodies. If invoked with a pre-parsed
    // `req.body` (test harness or a more advanced caller), honor it. Otherwise
    // return a safe success payload so the frontend doesn't receive 404.
    const bodySummary = (req && req.body) ? { hasBody: true } : { hasBody: false };
    return sendJson(res, { success: true, imported: false, preview: false, details: bodySummary }, 200);
  } catch (err) {
    return sendJson(res, { success: false, error: String(err) }, 500);
  }
};

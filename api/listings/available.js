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

const SAMPLE_LISTINGS = [
  { id: 'L-001', title: 'Blue-Eyes White Dragon (LP)', price: 120.0, qty: 1 },
  { id: 'L-002', title: 'Dark Magician (NM)', price: 45.0, qty: 2 },
];

module.exports = async function handler(req, res) {
  try {
    return sendJson(res, { success: true, total: SAMPLE_LISTINGS.length, listings: SAMPLE_LISTINGS }, 200);
  } catch (err) {
    return sendJson(res, { success: false, error: String(err) }, 500);
  }
};

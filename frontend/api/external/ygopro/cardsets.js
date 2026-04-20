module.exports = async function handler(req, res) {
  try {
    const target = 'https://db.ygoprodeck.com/api/v7/cardsets.php';
    if (typeof globalThis.fetch !== 'function') {
      try { if (typeof res.setHeader === 'function') res.setHeader('Content-Type', 'application/json'); } catch(_){ }
      try { if (typeof res.writeHead === 'function') res.writeHead(501); } catch(_){ }
      return res.end(JSON.stringify({ success: false, error: 'Server fetch not available in runtime' }));
    }
    const r = await globalThis.fetch(target);
    const txt = await r.text();
    try { if (typeof res.setHeader === 'function') res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json'); } catch(_){ }
    try { if (typeof res.writeHead === 'function') res.writeHead(r.status); } catch(_){ }
    return res.end(txt);
  } catch (err) {
    try { if (typeof res.setHeader === 'function') res.setHeader('Content-Type', 'application/json'); } catch(_){ }
    try { if (typeof res.writeHead === 'function') res.writeHead(500); } catch(_){ }
    return res.end(JSON.stringify({ success: false, error: String(err) }));
  }
};

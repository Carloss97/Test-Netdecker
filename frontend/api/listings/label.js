module.exports = async function handler(req, res) {
  try {
    const url = req.url || '/api/listings/label';
    const html = `<html><body><h3>Labels (stub)</h3><p>Requested: ${url}</p></body></html>`;
    try { if (typeof res.setHeader === 'function') res.setHeader('Content-Type', 'text/html'); } catch(_){ }
    try { if (typeof res.writeHead === 'function') res.writeHead(200); } catch(_){ }
    try { return res.end(html); } catch(_){ }
    res.statusCode = 200; res.end(html);
  } catch (err) {
    try { if (typeof res.setHeader === 'function') res.setHeader('Content-Type', 'text/plain'); } catch(_){ }
    try { if (typeof res.writeHead === 'function') res.writeHead(500); } catch(_){ }
    try { return res.end('Label stub error'); } catch(_){ }
  }
};

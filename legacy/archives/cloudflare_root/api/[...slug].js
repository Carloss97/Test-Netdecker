const path = require('path');
const fs = require('fs');

async function getReqBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on && req.on('data', (c) => chunks.push(Buffer.from(c)));
    req.on && req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on && req.on('error', (err) => reject(err));
  });
}

async function proxyToUpstream(req, res, target) {
  if (typeof globalThis.fetch !== 'function') {
    try { if (typeof res.setHeader === 'function') res.setHeader('Content-Type', 'application/json'); } catch(_){ }
    try { if (typeof res.writeHead === 'function') res.writeHead(501); } catch(_){ }
    try { return res.end(JSON.stringify({ success: false, error: 'Server fetch not available' })); } catch(_){ }
  }

  const headers = {};
  for (const k of Object.keys(req.headers || {})) {
    if (k.toLowerCase() === 'host') continue;
    headers[k] = req.headers[k];
  }

  const init = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      const buf = await getReqBody(req);
      if (buf && buf.length) {
        init.body = buf;
        init.headers = init.headers || {};
        init.headers['content-length'] = String(buf.length);
      }
    } catch (err) {
      // ignore body read errors
    }
  }

  const r = await globalThis.fetch(target, init);
  try { r.headers.forEach((v,k) => res.setHeader(k, v)); } catch(_){ }
  try { if (typeof res.writeHead === 'function') res.writeHead(r.status); } catch(_){ }
  const data = await r.arrayBuffer();
  return res.end(Buffer.from(data));
}

module.exports = async function (req, res) {
  try {
    const reqUrl = new URL(req.url || '/', `http://${req.headers && req.headers.host ? req.headers.host : 'localhost'}`);
    let parts = reqUrl.pathname.split('/').filter(Boolean);
    if (parts[0] === 'api') parts.shift();

    const baseRoot = path.join(__dirname, '..', '_api_handlers');
    const candidates = [];
    if (parts.length === 0) {
      candidates.push(path.join(baseRoot, 'index.js'));
    } else {
      candidates.push(path.join(baseRoot, ...parts) + '.js');
      candidates.push(path.join(baseRoot, ...parts) + '.php.js');
      candidates.push(path.join(baseRoot, ...parts, 'index.js'));
    }

    for (const c of candidates) {
      if (fs.existsSync(c)) {
        const h = require(c);
        const handler = (h && (h.default || h)) || h;
        if (typeof handler === 'function') return await handler(req, res);
      }
    }

    // Fallback: proxy to upstream backend
    const upstreamBase = process.env.UPSTREAM_API_URL || process.env.VITE_API_URL || 'https://api-erp.krumm.cl/api';
    const forwardPath = parts.join('/');
    const target = upstreamBase.replace(/\/$/, '') + (forwardPath ? '/' + forwardPath : '') + (reqUrl.search || '');
    return await proxyToUpstream(req, res, target);
  } catch (err) {
    try { if (typeof res.setHeader === 'function') res.setHeader('Content-Type', 'application/json'); } catch(_){ }
    try { if (typeof res.writeHead === 'function') res.writeHead(500); } catch(_){ }
    try { return res.end(JSON.stringify({ success: false, error: String(err) })); } catch(_){ }
  }
};

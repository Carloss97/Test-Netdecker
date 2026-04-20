// Wrapper to expose the same route path with .php suffix
const handler = require('./cardinfo.js');

module.exports = async function (req, res) {
  try {
    return await handler(req, res);
  } catch (err) {
    try { if (typeof res.setHeader === 'function') res.setHeader('Content-Type', 'application/json'); } catch(_){}
    try { if (typeof res.writeHead === 'function') res.writeHead(500); } catch(_){}
    try { return res.end(JSON.stringify({ success: false, error: String(err) })); } catch(_){}
  }
};

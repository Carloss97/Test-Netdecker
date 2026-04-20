module.exports = (req, res) => {
  try {
    res.setHeader('Content-Type', 'text/plain');
    res.writeHead ? res.writeHead(200) : null;
    return res.end('ok');
  } catch (err) {
    try { res.writeHead && res.writeHead(500); } catch(_){}
    return res.end('error');
  }
};

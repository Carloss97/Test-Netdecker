module.exports = async function handler(req, res) {
  try {
    // Simple CSV stub: if ids and qtys query params present, echo them.
    const url = req.url || '';
    const q = (url.split('?')[1] || '');
    const params = new URLSearchParams(q);
    const ids = params.get('ids') || '';
    const qtys = params.get('qtys') || '';
    const idsArr = ids ? ids.split(',') : [];
    const qtysArr = qtys ? qtys.split(',') : [];

    const rows = ['id,qty'];
    for (let i = 0; i < idsArr.length; i++) {
      const id = idsArr[i] || '';
      const qv = qtysArr[i] || '1';
      rows.push(`${id},${qv}`);
    }

    const csv = rows.join('\n');
    try { if (typeof res.setHeader === 'function') res.setHeader('Content-Type', 'text/csv'); } catch(_){}
    try { if (typeof res.writeHead === 'function') res.writeHead(200); } catch(_){}
    try { return res.end(csv); } catch(_){}
    res.statusCode = 200; res.end(csv);
  } catch (err) {
    try { if (typeof res.setHeader === 'function') res.setHeader('Content-Type', 'text/plain'); } catch(_){}
    try { if (typeof res.writeHead === 'function') res.writeHead(500); } catch(_){}
    try { return res.end('Labels sheet stub error'); } catch(_){}
  }
};

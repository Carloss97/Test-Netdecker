const DEFAULT_TCGS = [
  { id: 'MAGIC', name: 'MAGIC', displayName: 'Magic: The Gathering' },
  { id: 'POKEMON', name: 'POKEMON', displayName: 'Pokémon Trading Card Game' },
  { id: 'YUGIOH', name: 'YUGIOH', displayName: 'Yu-Gi-Oh!' },
  { id: 'ONE_PIECE', name: 'ONE_PIECE', displayName: 'One Piece TCG' },
  { id: 'DIGIMON', name: 'DIGIMON', displayName: 'Digimon Card Game' },
  { id: 'WEISS_SCHWARZ', name: 'WEISS_SCHWARZ', displayName: 'Weiss Schwarz' },
];

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
    const tcgs = DEFAULT_TCGS.map((t) => ({ id: t.id, name: t.name, displayName: t.displayName }));
    return sendJson(res, { success: true, total: tcgs.length, tcgs }, 200);
  } catch (err) {
    return sendJson(res, { success: false, error: String(err) }, 500);
  }
};

const DEFAULT_TCGS = [
  { id: 'MAGIC', name: 'MAGIC', displayName: 'Magic: The Gathering' },
  { id: 'POKEMON', name: 'POKEMON', displayName: 'Pokémon Trading Card Game' },
  { id: 'YUGIOH', name: 'YUGIOH', displayName: "Yu-Gi-Oh!" },
  { id: 'ONE_PIECE', name: 'ONE_PIECE', displayName: 'One Piece TCG' },
  { id: 'DIGIMON', name: 'DIGIMON', displayName: 'Digimon Card Game' },
  { id: 'WEISS_SCHWARZ', name: 'WEISS_SCHWARZ', displayName: 'Weiss Schwarz' },
];

export async function onRequest(context) {
  try {
    const tcgs = DEFAULT_TCGS.map((t) => ({ id: t.id, name: t.name, displayName: t.displayName }));
    return new Response(JSON.stringify({ success: true, total: tcgs.length, tcgs }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

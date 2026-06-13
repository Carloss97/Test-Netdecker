import { CardDatabaseService } from '../../../../services/CardDatabaseService.js';

export async function onRequest(context) {
  try {
    const sets = await CardDatabaseService.listSets('YUGIOH');
    const payload = sets.map((set) => ({
      set_name: set.name,
      set_code: set.code,
      num_of_cards: set.totalCards || 0,
      tcg_date: set.releaseDate || null,
      source: 'tcgcsv',
    }));
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

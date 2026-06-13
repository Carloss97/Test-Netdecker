import { CardDatabaseService } from '../../../../services/CardDatabaseService.js';

function queryValue(params, key) {
  const value = String(params.get(key) || '').trim();
  return value.length > 0 ? value : null;
}

function inferType(card) {
  const text = [card.cardType, card.tags, card.metadata?.Type, card.metadata?.CardType, card.metadata?.SubType]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/\bspell\b|\bmagia\b/.test(text)) return 'Spell Card';
  if (/\btrap\b|\btrampa\b/.test(text)) return 'Trap Card';
  if (/\bxyz\b/.test(text)) return 'XYZ Monster';
  if (/\blink\b/.test(text)) return 'Link Monster';
  if (/\bfusion\b/.test(text)) return 'Fusion Monster';
  if (/\bsynchro\b/.test(text)) return 'Synchro Monster';
  if (/\britual\b/.test(text)) return 'Ritual Monster';
  if (/\bnormal\b/.test(text)) return 'Normal Monster';
  if (/\bpendulum\b/.test(text)) return 'Pendulum Effect Monster';
  return 'Effect Monster';
}

function mapToYgoCompat(card) {
  const price = card.priceMarket ?? card.priceMid ?? card.priceLow ?? 0;
  const numericId = Number(card.externalId);
  const id = Number.isFinite(numericId) ? numericId : card.externalId;
  return {
    id,
    name: card.cardName,
    type: inferType(card),
    frameType: inferType(card).toLowerCase().replace(/\s+/g, '_'),
    desc: card.description || '',
    race: card.metadata?.Race || card.metadata?.MonsterType || card.cardType || '',
    attribute: card.attribute || card.colorIdentity || card.metadata?.Attribute || '',
    card_sets: [{ set_name: card.editionName, set_code: card.cardNumber || card.editionCode, set_rarity: card.rarity || 'Unknown', set_price: String(price) }],
    card_images: [{ id, image_url: card.imageUrl || '', image_url_small: card.imageUrl || '' }],
    card_prices: [{ tcgplayer_price: String(price) }],
    misc_info: [{ source: card.source, tcgcsvProductId: card.externalId }],
  };
}

export async function onRequest(context) {
  try {
    const { request } = context;
    const url = new URL(request.url);
    const params = new URLSearchParams(url.search);
    const cardset = queryValue(params, 'cardset') || queryValue(params, 'setCode') || queryValue(params, 'set');
    const exactName = queryValue(params, 'name');
    const fuzzyName = queryValue(params, 'fname') || queryValue(params, 'query');
    const id = queryValue(params, 'id');
    let cards = [];

    if (id) {
      const card = await CardDatabaseService.getCardById('YUGIOH', id);
      cards = card ? [card] : [];
    } else if (cardset) {
      cards = await CardDatabaseService.getSetCards('YUGIOH', cardset);
    } else if (exactName || fuzzyName) {
      cards = await CardDatabaseService.searchCards('YUGIOH', exactName || fuzzyName);
    }

    const nameFilter = String(exactName || fuzzyName || '').toLowerCase();
    if (nameFilter) {
      cards = cards.filter((card) => {
        const cardName = String(card.cardName || '').toLowerCase();
        return exactName ? cardName === nameFilter : cardName.includes(nameFilter);
      });
    }

    return new Response(JSON.stringify({ data: cards.map(mapToYgoCompat) }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

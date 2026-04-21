export async function onRequest(context) {
  const { request } = context;
  try {
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
    const template = [
      'tcg,editionCode,editionName,cardCode,cardName,cardNumber,rarity,tags,imageUrl,condition,quantity,referencePrice,marginMultiplier',
      'MAGIC,MH3,Modern Horizons 3,123,Lightning Bolt,123,Common,instant|burn,,NM,10,2.5,1.2'
    ].join('\n');
    return new Response(template, { status: 200, headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="inventory_template.csv"' } });
  } catch (err) {
    return new Response('Error', { status: 500 });
  }
}

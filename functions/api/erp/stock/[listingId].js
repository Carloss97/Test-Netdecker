export async function onRequest(context) {
  if (context && context.params && context.params.listingId && !context.params.id) {
    context.params.id = context.params.listingId;
  }
  const mod = await import('../../listings/[id]/stock.js');
  if (mod && mod.onRequest) return mod.onRequest(context);
  throw new Error('delegate handler not available');
}

export default onRequest;

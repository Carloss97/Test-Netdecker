import { onRequest as delegate } from '../../listings/[id]/stock.js';

export async function onRequest(context) {
  if (context && context.params && context.params.listingId && !context.params.id) {
    context.params.id = context.params.listingId;
  }
  return delegate(context);
}

export default onRequest;

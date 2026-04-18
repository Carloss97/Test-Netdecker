import { onRequest as delegate } from '../../reservations/[id]/commit.js';

export async function onRequest(context) {
  return delegate(context);
}

export default onRequest;

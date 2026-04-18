import { onRequest as delegate } from '../../reservations/[id]/release.js';

export async function onRequest(context) {
  return delegate(context);
}

export default onRequest;

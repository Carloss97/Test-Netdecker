import { onRequest as delegate } from '../../cash-sessions/[id].js';

export async function onRequest(context) {
  return delegate(context);
}

export default onRequest;

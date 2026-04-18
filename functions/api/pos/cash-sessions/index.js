import { onRequest as delegate } from '../../cash-sessions/index.js';

export async function onRequest(context) {
  return delegate(context);
}

export default onRequest;

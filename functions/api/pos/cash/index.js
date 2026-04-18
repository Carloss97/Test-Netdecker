// Delegate POS cash routes to the top-level cash-sessions implementation
import { onRequest as delegate } from '../../cash-sessions/index.js';

export async function onRequest(context) {
  return delegate(context);
}

export default onRequest;

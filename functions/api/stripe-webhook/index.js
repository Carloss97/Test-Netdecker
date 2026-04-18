import { onRequest as delegate } from '../payments/webhook/index.js';

export async function onRequest(context) {
  return delegate(context);
}

export default onRequest;

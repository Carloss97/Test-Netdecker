import { onRequest as delegate } from '../pricing-preview.js';

export async function onRequest(context) {
  return delegate(context);
}

export default onRequest;

import { onRequest as delegate } from '../me.js';

export async function onRequest(context) {
  return delegate(context);
}

export default onRequest;

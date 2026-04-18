import { onRequest as delegate } from '../create.js';

export async function onRequest(context) {
  return delegate(context);
}

export default onRequest;

import { onRequest as delegate } from '../sets.js';

export async function onRequest(context) {
  return delegate(context);
}

export default onRequest;

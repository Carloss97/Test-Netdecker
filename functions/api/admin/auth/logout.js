import { onRequest as delegate } from '../logout.js';

export async function onRequest(context) {
  return delegate(context);
}

export default onRequest;

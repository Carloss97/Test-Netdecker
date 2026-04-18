import { onRequest as delegate } from '../login.js';

export async function onRequest(context) {
  return delegate(context);
}

export default onRequest;

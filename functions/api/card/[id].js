import { onRequest as delegate } from './index.js';

export async function onRequest(context) {
  return delegate(context);
}

export default onRequest;

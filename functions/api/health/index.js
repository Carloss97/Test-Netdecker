import { onRequest as delegate } from '../health.js';

export async function onRequest(context) {
  return delegate(context);
}

export default onRequest;

import { onRequest as delegate } from './reservations/index.js';

export async function onRequest(context) {
  return delegate(context);
}

export default onRequest;

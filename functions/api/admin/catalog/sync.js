import { onRequest as delegate } from '../catalog-sync.js';

export async function onRequest(context) {
  return delegate(context);
}

export default onRequest;

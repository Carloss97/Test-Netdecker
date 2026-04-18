import { onRequest as delegate } from '../catalog-bootstrap.js';

export async function onRequest(context) {
  return delegate(context);
}

export default onRequest;

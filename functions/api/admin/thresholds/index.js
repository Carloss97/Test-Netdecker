// Delegate to existing admin/pricing/thresholds implementation
import { onRequest as delegate } from '../pricing/thresholds.js';

export async function onRequest(context) {
  return delegate(context);
}

export default onRequest;

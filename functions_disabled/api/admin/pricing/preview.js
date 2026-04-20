export async function onRequest(context) {
  const mod = await import('../pricing-preview.js');
  if (mod && mod.onRequest) return mod.onRequest(context);
  throw new Error('delegate handler not available');
}

export default onRequest;

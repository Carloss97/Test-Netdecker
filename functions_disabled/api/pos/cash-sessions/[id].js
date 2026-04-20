export async function onRequest(context) {
  const mod = await import('../../cash-sessions/[id].js');
  if (mod && mod.onRequest) return mod.onRequest(context);
  throw new Error('delegate handler not available');
}

export default onRequest;

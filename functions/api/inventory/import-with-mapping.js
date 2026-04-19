export async function onRequest(context) {
  // Reuse import-csv handler which supports an optional `mapping` form field
  const mod = await import('./import-csv.js');
  if (mod && mod.onRequest) return mod.onRequest(context);
  throw new Error('delegate handler not available');
}

import { onRequest as importCsvHandler } from './import-csv.js';

export async function onRequest(context) {
  // Reuse import-csv handler which supports an optional `mapping` form field
  return importCsvHandler(context);
}

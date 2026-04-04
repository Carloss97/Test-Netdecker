// scripts/backfill-tcgplayer-productid.ts
// Ejecuta el backfill masivo de tcgplayerProductId desde Node.js, evitando problemas de shell/escape.

import { TcgplayerBackfillService } from '../src/services/TcgplayerBackfillService';

async function main() {
  console.log('Iniciando backfill masivo de tcgplayerProductId...');
  const result = await TcgplayerBackfillService.backfillProductIds({ limit: 5000, dryRun: false });
  console.log('Backfill completado. Resumen:');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('Error en backfill:', err);
  process.exit(1);
});

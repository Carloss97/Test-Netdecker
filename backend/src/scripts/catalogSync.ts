import 'dotenv/config';
import { CatalogSyncService } from '../services/CatalogSyncService.js';
import prisma from '../utils/db.js';

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

async function main() {
  const tcgRaw = getArg('tcg')?.toUpperCase();
  const tcg = tcgRaw && ['MAGIC', 'POKEMON', 'YUGIOH'].includes(tcgRaw)
    ? (tcgRaw as 'MAGIC' | 'POKEMON' | 'YUGIOH')
    : undefined;

  const result = await CatalogSyncService.syncNewSets({
    tcg,
    dryRun: process.argv.includes('--dry-run'),
    createListings: !process.argv.includes('--no-listings'),
    initialQuantity: getArg('quantity') ? Number.parseInt(getArg('quantity') || '0', 10) : 0,
    marginMultiplier: getArg('margin') ? Number.parseFloat(getArg('margin') || '1.2') : undefined,
    concurrency: getArg('concurrency') ? Number.parseInt(getArg('concurrency') || '4', 10) : 4,
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((err) => {
    console.error('Catalog sync failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

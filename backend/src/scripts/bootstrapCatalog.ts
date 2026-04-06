import 'dotenv/config';
import { CatalogBootstrapService } from '../services/CatalogBootstrapService.js';
import prisma from '../utils/db.js';
import { parseOptionalPositiveNumber, SUPPORTED_TCGS } from '../config/pricing.js';

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

async function main() {
  const tcgRaw = getArg('tcg')?.toUpperCase();
  const tcg = tcgRaw && SUPPORTED_TCGS.includes(tcgRaw as typeof SUPPORTED_TCGS[number])
    ? (tcgRaw as typeof SUPPORTED_TCGS[number])
    : undefined;

  const result = await CatalogBootstrapService.bootstrapCatalog({
    tcg,
    setCode: getArg('set'),
    setLimit: getArg('set-limit') ? Number.parseInt(getArg('set-limit') || '0', 10) : undefined,
    dryRun: process.argv.includes('--dry-run'),
    createListings: !process.argv.includes('--no-listings'),
    initialQuantity: getArg('quantity') ? Number.parseInt(getArg('quantity') || '0', 10) : 0,
    marginMultiplier: parseOptionalPositiveNumber(getArg('margin')),
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((err) => {
    console.error('Catalog bootstrap failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

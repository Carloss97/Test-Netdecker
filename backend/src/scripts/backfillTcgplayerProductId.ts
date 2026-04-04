import 'dotenv/config';
import { TcgplayerBackfillService } from '../services/TcgplayerBackfillService.js';
import prisma from '../utils/db.js';

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

async function main() {
  const limit = Number.parseInt(getArg('limit') || '500', 10);
  const offset = Number.parseInt(getArg('offset') || '0', 10);
  const dryRun = process.argv.includes('--dry-run');
  const tcgRaw = getArg('tcg')?.toUpperCase();
  const tcg = tcgRaw && ['MAGIC', 'POKEMON', 'YUGIOH', 'ONE_PIECE'].includes(tcgRaw)
    ? (tcgRaw as 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE')
    : undefined;

  const result = await TcgplayerBackfillService.backfillProductIds({
    limit: Number.isFinite(limit) ? limit : 500,
    offset: Number.isFinite(offset) ? offset : 0,
    dryRun,
    tcg,
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

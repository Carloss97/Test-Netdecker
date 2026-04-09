/// <reference types="node" />

// backend/prisma/seed.ts
import dotenv from 'dotenv';
// Load .env for DATABASE_URL/USE_SQLITE when running the seed manually
dotenv.config({ path: process.env.BACKEND_ENV_PATH || '.env' });

// Decide whether to use the SQLite-generated client or the default Postgres client
const useSqlite = (process.env.USE_SQLITE === 'true') || (process.env.DATABASE_URL ?? '').startsWith('file:');

let PrismaClientClass: any;
if (useSqlite) {
  // Use the generated SQLite client package
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pkg = await import('@prisma/client_sqlite');
  PrismaClientClass = pkg.PrismaClient ?? pkg.default?.PrismaClient ?? pkg.default;
} else {
  const pkg = await import('@prisma/client');
  PrismaClientClass = pkg.PrismaClient ?? pkg.default?.PrismaClient ?? pkg.default;
}

const prisma = new PrismaClientClass();

// Minimal TCGType alias for the seed script
type TCGType = 'MAGIC' | 'POKEMON' | 'YUGIOH' | 'ONE_PIECE' | 'DIGIMON' | 'WEISS_SCHWARZ';

async function main() {
  console.log('Seeding database with default TCGs...');

  const tcgs = [
    {
      name: 'MAGIC' as TCGType,
      displayName: 'Magic: The Gathering',
      description: 'The world\'s first trading card game'
    },
    {
      name: 'POKEMON' as TCGType,
      displayName: 'Pokémon Trading Card Game',
      description: 'Catch \'em all!'
    },
    {
      name: 'YUGIOH' as TCGType,
      displayName: 'Yu-Gi-Oh!',
      description: 'Duel Monsters'
    },
    {
      name: 'ONE_PIECE' as TCGType,
      displayName: 'One Piece Trading Card Game',
      description: 'Sailin\' for adventure'
    },
    {
      name: 'DIGIMON' as TCGType,
      displayName: 'Digimon Card Game',
      description: 'Digivolve to victory'
    },
    {
      name: 'WEISS_SCHWARZ' as TCGType,
      displayName: 'Weiss Schwarz',
      description: 'Anime-themed card game by Bushiroad'
    }
  ];

  for (const tcg of tcgs) {
    await prisma.tCG.upsert({
      where: { name: tcg.name },
      update: {
        displayName: tcg.displayName,
        description: tcg.description
      },
      create: {
        name: tcg.name,
        displayName: tcg.displayName,
        description: tcg.description
      }
    });
    console.log(`✓ ${tcg.displayName}`);
  }

  console.log('Seed complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

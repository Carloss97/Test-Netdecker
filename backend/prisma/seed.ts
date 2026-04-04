/// <reference types="node" />

// backend/prisma/seed.ts
import { PrismaClient, TCGType } from '@prisma/client';

const prisma = new PrismaClient();

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

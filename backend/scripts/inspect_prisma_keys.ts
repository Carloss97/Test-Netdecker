import prisma from '../src/utils/db.js';

(async () => {
  try {
    console.log('prisma keys:', Object.keys(prisma).sort().join(', '));
    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();

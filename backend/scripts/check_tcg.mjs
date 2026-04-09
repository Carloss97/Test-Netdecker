import pkg from '@prisma/client_sqlite';
const PrismaClient = pkg.PrismaClient ?? pkg.default;
const prisma = new PrismaClient();

try {
  await prisma.$connect();
  const rows = await prisma.tCG.findMany();
  console.log('rows:', rows.length);
  console.log(rows.map((r) => r.displayName));
} catch (err) {
  console.error('error querying tCG:', err);
} finally {
  await prisma.$disconnect();
}

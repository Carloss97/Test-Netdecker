// scripts/debug-prisma.ts — quick runtime inspection of prisma client
import prisma from '../src/utils/db.js';

(async function main() {
  try {
    console.log('[debug] prisma typeof:', typeof prisma);
    // Show top-level keys on the prisma object
    console.log('[debug] prisma keys:', Object.keys(prisma as any));
    // Check common model delegates
    console.log('[debug] has warehouse delegate:', !!(prisma as any).warehouse);
    console.log('[debug] has listing delegate:', !!(prisma as any).listing);
    console.log('[debug] has store delegate:', !!(prisma as any).store);
    process.exit(0);
  } catch (err) {
    console.error('[debug] error inspecting prisma:', err);
    process.exit(1);
  }
})();

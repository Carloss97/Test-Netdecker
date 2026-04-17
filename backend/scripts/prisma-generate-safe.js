#!/usr/bin/env node
import { execSync } from 'child_process';

console.log('Running prisma generate (safe helper)...');
try {
  execSync('npx prisma generate', { stdio: 'inherit' });
  console.log('prisma generate completed successfully.');
} catch (err) {
  console.error('prisma generate failed (non-fatal).');
  console.error('If you are on Windows + OneDrive see backend/PRISMA_WINDOWS.md for workarounds.');
  // keep non-zero errors from blocking CI flows that only need tests or front-end build
  process.exitCode = 0;
}

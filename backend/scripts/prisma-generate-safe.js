#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function loadDotEnvIfPresent() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function isSqliteMode() {
  const useSqlite = String(process.env.USE_SQLITE || '').trim().toLowerCase();
  const databaseUrl = String(process.env.DATABASE_URL || '').trim();
  return useSqlite === 'true' || databaseUrl.startsWith('file:');
}

function run(command) {
  execSync(command, { stdio: 'inherit' });
}

console.log('Running prisma generate (safe helper)...');
try {
  loadDotEnvIfPresent();

  if (isSqliteMode() && fs.existsSync(path.resolve(process.cwd(), 'prisma/schema.sqlite.prisma'))) {
    console.log('Detected SQLite local mode; generating SQLite Prisma client...');
    run('npx prisma generate --schema=prisma/schema.sqlite.prisma');

    console.log('Applying SQLite schema to local database...');
    run('npx prisma db push --schema=prisma/schema.sqlite.prisma --accept-data-loss');
  } else {
    run('npx prisma generate');
  }

  console.log('prisma generate completed successfully.');
} catch (err) {
  console.error('prisma generate failed (non-fatal).');
  console.error(err instanceof Error ? err.message : String(err));
  console.error('If you are on Windows + OneDrive see backend/PRISMA_WINDOWS.md for workarounds.');
  // keep non-zero errors from blocking CI flows that only need tests or front-end build
  process.exitCode = 0;
}

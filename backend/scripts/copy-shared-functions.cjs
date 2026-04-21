#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');
const srcDir = path.join(backendRoot, 'src', 'functions', '_shared');
const destDir = path.join(backendRoot, 'dist', 'functions', '_shared');

async function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`[copy-shared-functions] Source not found: ${src}`);
    return;
  }

  await fs.promises.mkdir(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.promises.copyFile(srcPath, destPath);
    }
  }
}

copyDir(srcDir, destDir)
  .then(() => {
    console.log('[copy-shared-functions] Done');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[copy-shared-functions] Error:', err);
    process.exit(2);
  });

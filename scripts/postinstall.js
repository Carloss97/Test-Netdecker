#!/usr/bin/env node
const { execSync } = require('child_process');

const isCI = !!process.env.CI || process.env.CF_PAGES || process.env.CF_BUILD_IMAGE;
if (isCI) {
  console.log('CI detected; skipping nested backend/frontend install.');
  process.exit(0);
}

console.log('Running nested install for backend and frontend...');
try {
  execSync('npm --prefix backend install', { stdio: 'inherit' });
  execSync('npm --prefix frontend install', { stdio: 'inherit' });
  console.log('Nested install finished.');
} catch (err) {
  console.error('Nested install failed:', err);
  process.exit(1);
}

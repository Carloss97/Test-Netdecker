#!/usr/bin/env node
const { execSync } = require('child_process');

const isCI = !!process.env.CI || process.env.CF_PAGES || process.env.CF_BUILD_IMAGE;
if (isCI) {
  console.log('CI detected; running frontend build only.');
  try {
    execSync('npm --prefix frontend run build', { stdio: 'inherit' });
    console.log('Frontend build finished.');
    process.exit(0);
  } catch (err) {
    console.error('Frontend build failed:', err);
    process.exit(1);
  }
}

console.log('Running backend and frontend builds (local mode).');
try {
  execSync('npm --prefix backend run build', { stdio: 'inherit' });
  execSync('npm --prefix frontend run build', { stdio: 'inherit' });
  console.log('Build finished.');
} catch (err) {
  console.error('Build failed:', err);
  process.exit(1);
}

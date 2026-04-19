#!/usr/bin/env node
const { execSync } = require('child_process');

const isCI = !!process.env.CI;
const isCloudflarePages = !!process.env.CF_PAGES || !!process.env.CF_BUILD_IMAGE;

// On Cloudflare Pages builds we only need the frontend artifacts (serverless environment),
// but for other CI environments (including Render) we should build both backend and frontend.
if (isCI && isCloudflarePages) {
  console.log('Cloudflare Pages detected; running frontend build only.');
  try {
    try {
      console.log('Installing frontend dependencies (including devDependencies) for CI...');
      execSync('npm --prefix frontend ci --include=dev --no-audit --progress=false', { stdio: 'inherit' });
    } catch (installErr) {
      console.warn('Failed to run nested frontend install (non-fatal), attempting build anyway...');
    }

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

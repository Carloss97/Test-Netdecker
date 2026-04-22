#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(1);
}

function ok(msg) {
  console.log('OK:', msg);
}

// 1) Check build output
const distIndex = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
if (!fs.existsSync(distIndex)) fail(`${distIndex} not found — run \"npm --prefix frontend run build\" first`);
ok('frontend build exists');

// 2) Validate wrangler.jsonc presence and D1 binding
const wranglerPath = path.join(__dirname, '..', 'wrangler.jsonc');
if (!fs.existsSync(wranglerPath)) fail('wrangler.jsonc not found');
const raw = fs.readFileSync(wranglerPath, 'utf8');
let cfg = null;
try { cfg = JSON.parse(raw); } catch (err) { try { cfg = eval('(' + raw + ')'); } catch (e) { fail('wrangler.jsonc parse error'); } }
if (!cfg || !cfg.d1_databases || !Array.isArray(cfg.d1_databases)) fail('wrangler.jsonc missing d1_databases');
const hasBinding = cfg.d1_databases.some((d) => d.binding === 'TCG_D1');
if (!hasBinding) fail('wrangler.jsonc does not declare a TCG_D1 binding');
ok('wrangler.jsonc contains TCG_D1 binding');

// 3) Check functions file
const funcPath = path.join(__dirname, '..', 'functions', 'api', 'listings', 'available.js');
if (!fs.existsSync(funcPath)) fail('functions api listing endpoint not found: ' + funcPath);
ok('functions listing endpoint found');

// 3.1) Check embeddable catalog function
const catalogFuncPath = path.join(__dirname, '..', 'functions', 'tienda', '[slug]', 'catalogo.js');
if (!fs.existsSync(catalogFuncPath)) fail('functions embeddable catalog endpoint not found: ' + catalogFuncPath);
ok('functions embeddable catalog endpoint found');

// 4) Optional live check
const base = process.env.PAGES_DEV_URL;
(async () => {
  if (!base) {
    console.log('Skipping live checks — set PAGES_DEV_URL to run live endpoint checks.');
    process.exit(0);
  }
  try {
    console.log('Running live endpoint checks against', base);
    const urls = [
      '/api/listings/available',
      '/api/listings/sync-prices',
      '/api/listings/sync-prices/runs'
    ];
    for (const u of urls) {
      const res = await fetch(base + u, { method: 'GET' });
      console.log(u, res.status);
    }
    process.exit(0);
  } catch (err) {
    console.error('Live checks failed:', err);
    process.exit(2);
  }
})();

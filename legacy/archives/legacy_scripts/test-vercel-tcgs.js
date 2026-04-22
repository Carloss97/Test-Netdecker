const fs = require('fs');
const path = require('path');
const vm = require('vm');

(async function main(){
  try {
    const root = path.resolve(__dirname, '..');
    const vercelPath = path.join(root, 'vercel.json');
    const vercelRaw = fs.readFileSync(vercelPath, 'utf8');
    const vercel = JSON.parse(vercelRaw);
    const rewrites = vercel.rewrites || [];
    const hasExternal = rewrites.some(r => r && r.source === '/api/(.*)' && /api-erp\.krumm\.cl/.test(r.destination || ''));
    console.log('vercel.json external rewrite present:', hasExternal);

    const idxPath = path.join(root, 'functions', 'api', 'tcgs', 'index.js');
    const src = fs.readFileSync(idxPath, 'utf8');
    const m = src.match(/const\s+DEFAULT_TCGS\s*=\s*(\[[\s\S]*?\]);/m);
    if (!m) {
      console.error('ERROR: DEFAULT_TCGS literal not found in index.js');
      process.exit(2);
    }
    const literal = m[1];
    let arr;
    try {
      arr = vm.runInNewContext('(' + literal + ')', {});
    } catch (err) {
      console.error('ERROR: Could not evaluate DEFAULT_TCGS literal:', err.message);
      process.exit(2);
    }

    console.log('DEFAULT_TCGS length:', Array.isArray(arr) ? arr.length : 'not array');
    const hasYgo = Array.isArray(arr) && arr.some(e => String((e && e.id) || '').toUpperCase() === 'YUGIOH');
    console.log('DEFAULT_TCGS contains YUGIOH:', !!hasYgo);

    if (!hasExternal && Array.isArray(arr)) {
      console.log('SMOKE TEST: PASS');
      process.exit(0);
    }
    console.log('SMOKE TEST: FAIL');
    process.exit(1);
  } catch (err) {
    console.error('ERROR:', err && err.stack ? err.stack : err);
    process.exit(3);
  }
})();

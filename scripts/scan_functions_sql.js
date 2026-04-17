const fs = require('fs').promises;
const path = require('path');

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...await walk(full));
    else if (e.isFile() && /\.([jt]s|jsx?|tsx?)$/.test(e.name)) files.push(full);
  }
  return files;
}

function extractMatches(content) {
  const matches = [];
  // capture SELECT ... FROM card|listing snippets
  const sqlRegex = /SELECT[\s\S]{0,400}?FROM\s+(?:card|listing)\b/gi;
  let m;
  while ((m = sqlRegex.exec(content))) {
    const idx = m.index;
    const start = Math.max(0, content.lastIndexOf('\n', idx) + 1);
    const end = Math.min(content.length, idx + 400);
    matches.push(content.slice(start, end).split('\n').slice(0,4).join('\n'));
  }

  // priceMarket/priceMid references
  const cols = ['priceMarket','priceMid','priceLow','everHadStock'];
  for (const c of cols) {
    const re = new RegExp(`\\b${c}\\b`, 'g');
    if (re.test(content)) matches.push(`COLUMN_REF:${c}`);
  }
  return matches;
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const functionsDir = path.join(root, 'functions');
  const out = [];
  try {
    const files = await walk(functionsDir);
    for (const f of files) {
      const txt = await fs.readFile(f, 'utf8');
      const matches = extractMatches(txt);
      if (matches.length) {
        out.push({ file: path.relative(root, f).replace(/\\\\/g, '/'), matches });
      }
    }
  } catch (err) {
    console.error('scan error', String(err));
    process.exitCode = 2;
    return;
  }

  const outFile = path.join(root, 'scan-functions-sql.json');
  await fs.writeFile(outFile, JSON.stringify(out, null, 2));
  console.log(`Scan complete. ${out.length} files with candidates. Results -> ${outFile}`);
}

main().catch((e) => { console.error(e); process.exit(2); });

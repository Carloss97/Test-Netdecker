const fs = require('fs');
const path = require('path');

function listFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) results = results.concat(listFiles(full));
    else results.push(full);
  }
  return results;
}

function toKebab(s) {
  return s
    .replace(/\./g, '/')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase();
}

function existsAny(base) {
  const candidates = [
    `${base}.js`,
    `${base}.mjs`,
    path.join(base, 'index.js'),
    path.join(base, 'index.mjs'),
  ];
  return candidates.find(p => fs.existsSync(p));
}

const repoRoot = path.resolve(__dirname, '..');
const backendDir = path.join(repoRoot, 'backend', 'src', 'routes');
const functionsDir = path.join(repoRoot, 'functions', 'api');

const backendFiles = listFiles(backendDir).filter(f => f.endsWith('.ts'));
const backendTokens = backendFiles.map(f => path.basename(f).replace(/\.routes\.ts$/,'').replace(/\.ts$/,''));

const report = { found: [], missing: [], heuristics: [] };
for (const token of backendTokens) {
  if (token.endsWith('.test')) {
    report.heuristics.push({ token, reason: 'test-file - skip' });
    continue;
  }

  // Try direct mapping: replace dots with path separators
  const directPath = path.join(functionsDir, ...token.split('.'));
  const directFound = existsAny(directPath);
  if (directFound) {
    report.found.push({ token, match: directFound });
    continue;
  }

  // Try kebab-case mapping
  const kebab = toKebab(token);
  const kebabPath = path.join(functionsDir, kebab);
  const kebabFound = existsAny(kebabPath);
  if (kebabFound) {
    report.found.push({ token, match: kebabFound });
    continue;
  }

  // Try pluralization (append 's')
  const plural = kebab.endsWith('s') ? kebab : kebab + 's';
  const pluralFound = existsAny(path.join(functionsDir, plural));
  if (pluralFound) {
    report.found.push({ token, match: pluralFound });
    continue;
  }

  // Try top-level folder match (first segment)
  const top = token.split('.')[0];
  const topK = toKebab(top);
  const topFound = existsAny(path.join(functionsDir, topK));
  if (topFound) {
    report.found.push({ token, match: topFound, note: 'matched top-level folder' });
    continue;
  }

  // Not found
  report.missing.push(token);
}

const outPath = path.join(repoRoot, 'tmp', 'routes-vs-functions-report-v2.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
console.log('Wrote report to', outPath);
console.log('Missing tokens:', report.missing);
process.exit(0);

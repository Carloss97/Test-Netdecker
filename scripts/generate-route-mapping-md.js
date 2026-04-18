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
    .replace(/[_.\s]+/g, '-')
    .toLowerCase();
}

function existsAny(base) {
  const candidates = [
    `${base}.js`,
    `${base}.mjs`,
    `${path.join(base, 'index.js')}`,
    `${path.join(base, 'index.mjs')}`,
  ];
  return candidates.find(p => fs.existsSync(p));
}

const repoRoot = path.resolve(__dirname, '..');
const backendDir = path.join(repoRoot, 'backend', 'src', 'routes');
const functionsDir = path.join(repoRoot, 'functions', 'api');
const reportPath = path.join(repoRoot, 'tmp', 'routes-vs-functions-report-v2.json');
if (!fs.existsSync(reportPath)) {
  console.error('Report not found:', reportPath);
  process.exit(2);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const backendFiles = listFiles(backendDir).filter(f => f.endsWith('.ts'));

const mapping = [];
for (const bf of backendFiles) {
  const token = path.basename(bf).replace(/\.routes\.ts$/,'').replace(/\.ts$/,'');
  const found = report.found.find(x => x.token === token);
  if (found) {
    mapping.push({ backendFile: path.relative(repoRoot, bf), token, mappedTo: path.relative(repoRoot, found.match), exists: true, note: 'direct match from report' });
    continue;
  }

  // heuristics
  const kebab = toKebab(token);
  const candidates = [
    path.join(functionsDir, kebab),
    path.join(functionsDir, kebab + 's'),
    path.join(functionsDir, token),
    path.join(functionsDir, token.replace(/\./g, '/')),
  ];
  let match = null;
  for (const c of candidates) {
    const ex = existsAny(c);
    if (ex) {
      match = ex;
      break;
    }
  }

  // special-case public -> tienda
  if (!match && token === 'public') {
    const c = path.join(repoRoot, 'functions', 'tienda');
    const ex = existsAny(path.join(c, '[slug]', 'catalogo')) || existsAny(c);
    if (ex) match = ex;
  }

  if (match) {
    mapping.push({ backendFile: path.relative(repoRoot, bf), token, mappedTo: path.relative(repoRoot, match), exists: true, note: 'heuristic match' });
  } else {
    // suggest candidate
    const suggested = path.join(functionsDir, kebab);
    mapping.push({ backendFile: path.relative(repoRoot, bf), token, mappedTo: null, exists: false, suggested: path.relative(repoRoot, suggested), note: 'no match; suggested path' });
  }
}

// write markdown
const mdLines = [];
mdLines.push('# Ruta Backend → Functions Mapping');
mdLines.push('Generated at: ' + new Date().toISOString());
mdLines.push('');
mdLines.push('## Summary');
mdLines.push(`- Backend route files: ${backendFiles.length}`);
mdLines.push(`- Functions top-level entries (report): ${report.found.length}`);
mdLines.push('');
mdLines.push('## Mapping');
mdLines.push('Backend file | Token | Functions mapping | Exists | Note');
mdLines.push('--- | --- | --- | --- | ---');
for (const m of mapping) {
  mdLines.push(`${m.backendFile} | ${m.token} | ${m.mappedTo || m.suggested || ''} | ${m.exists ? 'yes' : 'no'} | ${m.note}`);
}

const outPath = path.join(repoRoot, 'tmp', 'routes-mapping-final.md');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, mdLines.join('\n'), 'utf8');
console.log('Wrote', outPath);

// create skeleton stubs for missing endpoints (only where target doesn't exist)
const stubs = [];
for (const m of mapping.filter(x => !x.exists)) {
  const suggested = m.suggested || path.join(functionsDir, toKebab(m.token));
  const idxPath = path.join(repoRoot, suggested);
  const finalDir = idxPath.endsWith('.js') || idxPath.endsWith('.mjs') ? path.dirname(idxPath) : idxPath;
  if (!fs.existsSync(finalDir)) {
    fs.mkdirSync(finalDir, { recursive: true });
    const stubFile = path.join(finalDir, 'index.js');
    const content = `// Auto-generated stub for backend route ${m.backendFile}\n// TODO: Port implementation from backend/src/routes/${path.basename(m.backendFile)}\n\nexport async function onRequest(context) {\n  return new Response(JSON.stringify({ error: 'Not implemented', route: '${m.token}' }), { status: 501, headers: { 'Content-Type': 'application/json' } });\n}\n\nexport default onRequest;\n`;
    fs.writeFileSync(stubFile, content, 'utf8');
    stubs.push(path.relative(repoRoot, stubFile));
  }
}

if (stubs.length > 0) {
  console.log('Created stubs:');
  stubs.forEach(s => console.log(' -', s));
} else {
  console.log('No stubs created (all mapped).');
}

// PR skeleton
const prmd = `# PR Skeleton: Port backend routes to Cloudflare Functions\n\nThis PR will add stubs and mapping for missing backend routes so they can be ported to Cloudflare Pages Functions.\n\nFiles created as stubs:\n\n${stubs.map(s => '- ' + s).join('\n')}\n\nNext steps:\n1. Implement logic in each stub, using existing functions/_shared helpers and D1-safe queries.\n2. Add tests mirroring backend route tests.\n3. Run local 'wrangler pages dev' + 'node scripts/pages-smoke-test.js' to validate.\n`;
fs.writeFileSync(path.join(repoRoot, 'PR_SKELETON.md'), prmd, 'utf8');
console.log('Wrote PR_SKELETON.md');

process.exit(0);

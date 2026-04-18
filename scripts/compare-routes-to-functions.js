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

const repoRoot = path.resolve(__dirname, '..');
const backendDir = path.join(repoRoot, 'backend', 'src', 'routes');
const functionsDir = path.join(repoRoot, 'functions', 'api');

const backendFiles = listFiles(backendDir).filter(f => f.endsWith('.ts'));
const backendTokens = backendFiles.map(f => {
  const name = path.basename(f);
  return name.replace(/\.routes\.ts$/,'').replace(/\.ts$/,'');
});

const functionFiles = listFiles(functionsDir);
const functionTopLevel = new Set();
for (const f of functionFiles) {
  const rel = path.relative(functionsDir, f).replace(/\\/g, '/');
  const parts = rel.split('/');
  if (parts.length > 0) {
    const top = parts[0];
    const tok = top.replace(/\.js$/,'');
    functionTopLevel.add(tok);
  }
}

const uniqBackend = Array.from(new Set(backendTokens));
const missing = uniqBackend.filter(b => !functionTopLevel.has(b));

const report = {
  backendFilesCount: backendFiles.length,
  functionsEntriesCount: functionTopLevel.size,
  backendTokens: uniqBackend.sort(),
  functionsTopLevel: Array.from(functionTopLevel).sort(),
  missingBackendTokens: missing.sort(),
  generatedAt: new Date().toISOString(),
};

const outPath = path.join(repoRoot, 'tmp', 'routes-vs-functions-report.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
console.log('Wrote report to', outPath);
console.log('Missing tokens:', missing);
process.exit(0);

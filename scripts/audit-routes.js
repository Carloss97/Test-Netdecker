const fs = require('fs').promises;
const path = require('path');

function normalizeSlashes(s) { return s.replace(/\\/g, '/'); }

async function listFiles(dir, ext = '.js') {
  const out = [];
  async function walk(d) {
    let entries = [];
    try { entries = await fs.readdir(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && full.endsWith(ext)) out.push(full);
    }
  }
  await walk(dir);
  return out;
}

function toPosix(p) { return normalizeSlashes(p); }

async function run() {
  const cwd = process.cwd();
  const indexFile = path.join(cwd, 'backend', 'src', 'index.ts');
  const routesDir = path.join(cwd, 'backend', 'src', 'routes');
  const functionsDir = path.join(cwd, 'functions');

  const indexContent = await fs.readFile(indexFile, 'utf8');

  // parse imports from index.ts to map variable -> route file
  const importRegex = /import\s+([A-Za-z0-9_$]+)\s+from\s+['"](.\/routes\/([^'"\)]+))['"]/g;
  const importMap = {};
  let m;
  while ((m = importRegex.exec(indexContent)) !== null) {
    const varName = m[1];
    const rel = m[3]; // e.g. public.routes.js
    importMap[varName] = rel;
  }

  // parse app.use mounts like: app.use('/api/health', healthRoutes);
  const useRegex = /app\.use\(\s*['"]([^'"]+)['"]\s*,\s*([A-Za-z0-9_$]+)\s*\)/g;
  const mounts = [];
  while ((m = useRegex.exec(indexContent)) !== null) {
    const mountPath = m[1];
    const varName = m[2];
    const routeFile = importMap[varName] || null;
    mounts.push({ mountPath, varName, routeFile });
  }

  const backendRoutes = [];
  for (const mount of mounts) {
    if (!mount.routeFile) continue;
    // routeFile like 'public.routes.js' -> map to backend/src/routes/public.routes.ts
    const routeFileName = mount.routeFile.replace(/\.js$/, '.ts');
    const routePath = path.join(routesDir, routeFileName);
    let content = '';
    try { content = await fs.readFile(routePath, 'utf8'); } catch (err) { continue; }

    const routeRegex = /router\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let r;
    while ((r = routeRegex.exec(content)) !== null) {
      let local = r[2];
      if (!local.startsWith('/')) local = '/' + local;
      // join mount + local path (use posix join)
      let full = ('' + mount.mountPath).replace(/\/$/, '') + local;
      backendRoutes.push({ method: r[1].toUpperCase(), path: full, file: routePath });
    }

    // capture router.use(...) inside route files as well (nested routers)
    const useLocal = /router\.use\(\s*['"`]([^'"`]+)['"`]\s*,\s*([A-Za-z0-9_$]+)?/g;
    while ((r = useLocal.exec(content)) !== null) {
      const localPrefix = r[1];
      let full = ('' + mount.mountPath).replace(/\/$/, '') + (localPrefix.startsWith('/') ? localPrefix : '/' + localPrefix);
      backendRoutes.push({ method: 'USE', path: full, file: routePath });
    }
  }

  // dedupe
  const dedup = new Map();
  for (const b of backendRoutes) dedup.set(`${b.method} ${b.path}`, b);
  const backendList = Array.from(dedup.values()).sort((a,b)=>a.path.localeCompare(b.path));

  // helper to build candidate function file paths
  function candidatesForRoute(routePath) {
    const routeNoLeading = routePath.replace(/^\/+/, '');
    const bracketed = routeNoLeading.replace(/:([^/]+)/g, '[$1]');
    return [
      path.join(functionsDir, bracketed + '.js'),
      path.join(functionsDir, bracketed, 'index.js')
    ];
  }

  // check existence
  const matched = [];
  const missing = [];
  for (const r of backendList) {
    const cands = candidatesForRoute(r.path);
    let found = null;
    for (const c of cands) {
      try {
        await fs.access(c);
        found = c;
        break;
      } catch (err) {}
    }
    if (found) matched.push({ ...r, function: toPosix(found).replace(toPosix(process.cwd()) + '/','') });
    else missing.push(r);
  }

  // list all function files and compute their exposed routes
  const allFuncFiles = await listFiles(functionsDir, '.js');
  const funcRoutes = allFuncFiles.map((f) => {
    const rel = toPosix(path.relative(functionsDir, f));
    const withoutExt = rel.replace(/\.js$/,'');
    const withoutIndex = withoutExt.replace(/\/index$/,'').replace(/\/index$/,'');
    const route = '/' + withoutIndex.replace(/\//g, '/');
    const pretty = route.replace(/\[([^\]]+)\]/g, ':$1');
    return { file: toPosix(f).replace(toPosix(process.cwd()) + '/',''), route: pretty };
  });

  // find orphan functions (not present in backend routes)
  const backendPaths = new Set(backendList.map((b) => b.path));
  const orphans = funcRoutes.filter((fr) => {
    // normalize by removing trailing /
    const candidate = fr.route.replace(/\/+$|\/(?=\?)/,'');
    return !Array.from(backendPaths).some(bp => bp === candidate);
  });

  // print report
  console.log('===== ROUTE AUDIT REPORT =====');
  console.log(`Backend routes discovered: ${backendList.length}`);
  console.log(`Matched routes with Functions: ${matched.length}`);
  console.log(`Missing routes (need to port): ${missing.length}`);
  if (missing.length > 0) {
    console.log('\n-- Missing routes --');
    missing.forEach((m) => console.log(`${m.method} ${m.path}  (defined in ${m.file})`));
  }

  console.log(`\nTotal function files scanned: ${allFuncFiles.length}`);
  console.log(`Orphan function files (no backend route): ${orphans.length}`);
  if (orphans.length > 0) {
    console.log('\n-- Orphan functions --');
    orphans.forEach((o) => console.log(`${o.route} -> ${o.file}`));
  }
}

run().catch((e) => { console.error('Audit failed:', e); process.exit(2); });

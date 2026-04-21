import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

export async function importShared(moduleName: string): Promise<any> {
  const baseDir = path.dirname(fileURLToPath(import.meta.url));

  const candidates = [
    // backend-local copy (preferred for refactor)
    path.join(baseDir, '..', 'functions', '_shared', `${moduleName}.js`),
    // repo-root functions folder (legacy)
    path.join(baseDir, '..', '..', '..', 'functions', '_shared', `${moduleName}.js`),
    // explicit fallback to functions_disabled if present
    path.join(baseDir, '..', '..', '..', 'functions_disabled', '_shared', `${moduleName}.js`),
    // legacy folder (moved during cleanup)
    path.join(baseDir, '..', '..', '..', 'legacy', 'functions', '_shared', `${moduleName}.js`),
    path.join(baseDir, '..', '..', '..', 'legacy', 'functions_disabled', '_shared', `${moduleName}.js`),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      const url = pathToFileURL(candidate).href;
      const mod = await import(url);
      // If the imported module is CommonJS-like and exported as default, unwrap it
      if (mod && typeof mod === 'object' && 'default' in mod && mod.default && typeof mod.default === 'object') {
        return mod.default;
      }
      return mod;
    } catch (err) {
      // ignore and try next candidate
    }
  }

  throw new Error(`Shared module not found: ${moduleName}`);
}

export default importShared;

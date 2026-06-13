#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function safeLog(...args) {
  try { console.log(...args); } catch (_) {}
}

// Load backend/.env so DATABASE_URL and USE_SQLITE are available
try {
  const envPath = path.resolve(__dirname, '../backend/.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) return;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    });
    safeLog('Start wrapper: loaded backend/.env');
  }
} catch (_) {}

safeLog('Start wrapper: node', process.version);
safeLog('Working directory:', process.cwd());
safeLog('Important env: PORT=%s, NODE_ENV=%s, USE_SQLITE=%s', process.env.PORT, process.env.NODE_ENV, process.env.USE_SQLITE);
safeLog('DATABASE_URL present?', !!process.env.DATABASE_URL);

const distPath = path.resolve(__dirname, '../backend/dist');
safeLog('Checking backend/dist contents:');
try {
  const files = fs.readdirSync(distPath);
  files.forEach((f) => safeLog(' -', f));
} catch (err) {
  safeLog('Could not read backend/dist:', err && err.message ? err.message : String(err));
}

const child = spawn(process.execPath, ['backend/dist/server.js'], { stdio: 'inherit' });

child.on('exit', (code, signal) => {
  safeLog('Child process exit:', { code, signal });
  process.exit(code ?? (signal ? 1 : 0));
});

['SIGINT', 'SIGTERM', 'SIGHUP'].forEach((s) => {
  process.on(s, () => {
    safeLog('Wrapper received', s, 'forwarding to child');
    child.kill(s);
  });
});

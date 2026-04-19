#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function safeLog(...args) {
  try { console.log(...args); } catch (_) {}
}

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

#!/usr/bin/env node
import axios from 'axios';

const BASE = process.env.API_URL || process.env.BASE_URL || 'http://localhost:3333';

async function check(path: string) {
  const url = `${BASE.replace(/\/$/, '')}${path}`;
  try {
    const res = await axios.get(url, { timeout: 5000 });
    console.log(`OK  ${path} -> ${res.status}`);
    return true;
  } catch (err: any) {
    console.error(`ERR ${path} ->`, err.response?.status || err.message);
    return false;
  }
}

async function main() {
  console.log('Staging smoke checks against', BASE);
  const checks = [
    ['/api/health'],
    ['/api/listings?take=1'],
    ['/api/cards/search?name=charizard&limit=1']
  ];

  let ok = true;
  for (const [p] of checks) {
    const r = await check(p);
    ok = ok && r;
  }

  if (!ok) {
    console.error('Smoke checks failed');
    process.exit(2);
  }

  console.log('All smoke checks passed');
  process.exit(0);
}

main();

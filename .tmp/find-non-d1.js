const fs = require('fs');
const path = require('path');

function walk(dir, files = []) {
  const entries = fs.readdirSync(dir);
  for (const name of entries) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else if (stat.isFile() && full.endsWith('.js')) files.push(full);
  }
  return files;
}

const root = path.join(process.cwd(), 'functions');
if (!fs.existsSync(root)) {
  console.error('No functions dir');
  process.exit(1);
}
const files = walk(root);
const noPick = [];
for (const f of files) {
  const c = fs.readFileSync(f, 'utf8');
  if (!/pickDb/.test(c) && !/require\(\'@prisma/.test(c)) {
    noPick.push(path.relative(process.cwd(), f));
  }
}
console.log(JSON.stringify(noPick, null, 2));

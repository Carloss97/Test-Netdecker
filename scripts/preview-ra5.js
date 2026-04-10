const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const file = path.join(process.cwd(), 'testRA5', 'RA05_mapped.xlsx');
if (!fs.existsSync(file)) {
  console.error('File not found:', file);
  process.exit(1);
}

const wb = XLSX.readFile(file, { raw: true });
const sheet = wb.SheetNames[0];
const ws = wb.Sheets[sheet];
const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
const headers = (XLSX.utils.sheet_to_json(ws, { header: 1 })[0]) || [];

console.log('Headers:', headers.join(' | '));
const sample = rows.slice(0, 5).map((r, i) => ({ row: i + 1, ...r }));
console.log(JSON.stringify(sample, null, 2));

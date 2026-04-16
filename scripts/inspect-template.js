const path = require('path');
const ExcelJS = require('exceljs');
const fs = require('fs');

const DATA_DIR = path.resolve(process.cwd(), 'testRA5');
const TEMPLATE_PATH = path.join(DATA_DIR, 'TestYgo.xlsx');
if (!fs.existsSync(TEMPLATE_PATH)) {
  console.error('Template not found:', TEMPLATE_PATH);
  process.exit(1);
}

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);
  const sheet = wb.worksheets[0];

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    const vals = row.values.slice(1).map(v => (v === undefined || v === null) ? '' : v);
    rows.push(vals);
  });

  console.log('Sheet name:', sheet.name);
  console.log('Number of rows (including header):', rows.length);
  console.log('First 10 rows:');
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    console.log(i, rows[i]);
  }

  // Gather tokens that look like rarity siglas (2-5 uppercase letters)
  const tokens = new Set();
  for (const r of rows) {
    for (const cell of r) {
      if (!cell) continue;
      const parts = String(cell).split(/\s|,|;|\||-|\//).map(s => s.trim()).filter(Boolean);
      for (const p of parts) {
        if (/^[A-Z]{2,5}$/.test(p)) tokens.add(p);
      }
    }
  }

  console.log('Detected uppercase tokens (possible siglas):', Array.from(tokens).slice(0, 50));

  // Also print any cell that contains 'Rare' or 'Rareza' to inspect patterns
  const samples = [];
  for (const r of rows) {
    for (const cell of r) {
      if (!cell) continue;
      const s = String(cell);
      if (/rare|rareza|secret|collector|ultimate|platinum|starlight|super|ultra/i.test(s)) {
        samples.push(s);
      }
    }
  }
  console.log('Sample cells containing rarity words:', samples.slice(0, 40));
})();

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

(async () => {
  const file = path.join(process.cwd(), 'testRA5', 'RA05_mapped.xlsx');
  if (!fs.existsSync(file)) {
    console.error('File not found:', file);
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const sheet = wb.worksheets[0];
  const headers = (sheet.getRow(1).values || []).slice(1).map(v => (v === null || v === undefined) ? '' : String(v));

  console.log('Headers:', headers.join(' | '));

  const sample = [];
  const lastRow = Math.min(sheet.rowCount, 6);
  for (let r = 2; r <= lastRow; r++) {
    const row = sheet.getRow(r).values.slice(1);
    const obj = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i] || `col${i+1}`] = row[i] === undefined ? '' : row[i];
    }
    sample.push({ row: r - 1, ...obj });
  }
  console.log(JSON.stringify(sample, null, 2));
})();

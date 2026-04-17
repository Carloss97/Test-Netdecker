const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { parse } = require('csv-parse/sync');
const axios = require('axios');

const DATA_DIR = path.resolve(process.cwd(), 'testRA5');
const TEMPLATE_NAME = 'TestYgo.xlsx';
const TEMPLATE_PATH = path.join(DATA_DIR, TEMPLATE_NAME);

if (!fs.existsSync(DATA_DIR)) {
  console.error('Data directory not found:', DATA_DIR);
  process.exit(1);
}

const csvFile = fs.readdirSync(DATA_DIR).find(f => /^inventory-edition.*\.csv$/i.test(f));
if (!csvFile) {
  console.error('CSV file not found in', DATA_DIR);
  process.exit(1);
}

const CSV_PATH = path.join(DATA_DIR, csvFile);
const OUTPUT_PATH = path.join(DATA_DIR, 'RA05_mapped.xlsx');

if (!fs.existsSync(TEMPLATE_PATH)) {
  console.error('Template file not found:', TEMPLATE_PATH);
  process.exit(1);
}

console.log('Template:', TEMPLATE_PATH);
console.log('CSV:', CSV_PATH);
// Header and CSV placeholders (will be populated in the async flow)
let tplHeaders = [];
let tplSheetName = 'Sheet1';
let csvData = [];

function getCsvVal(row, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
    const found = Object.keys(row).find(k => k.toLowerCase() === key.toLowerCase());
    if (found) return row[found];
  }
  return '';
}

function computeCLP(row) {
  const ref = parseFloat(getCsvVal(row, ['referencePrice', 'reference_price', 'reference', 'referenceprice'])) || 0;
  const margin = parseFloat(getCsvVal(row, ['marginMultiplier', 'margin_multiplier', 'margin'])) || 1;
  return ref * 1000 * margin;
}

function getSigla(rarityText) {
  const s = String(rarityText || '').toLowerCase();
  const norm = s.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!norm) return '';
  if (norm.includes('platinum') && norm.includes('secret')) return 'PLS';
  if (norm.includes('prismatic secret')) return 'PRSE';
  if (norm.includes('prismatic collector')) return 'PC';
  if (norm.includes('prismatic ultimate')) return 'PU';
  if (norm.includes('ghost gold')) return 'GHG';
  if (norm.includes('ghost')) return 'GH';
  if (norm.includes('gold secret')) return 'GLS';
  if (norm.includes('rare gold')) return 'RAG';
  if (norm.includes('gold') && norm.includes('rare')) return 'GLR';
  if (norm.includes('starlight')) return 'ST';
  if (norm.includes('starfoil')) return 'STF';
  if (norm.includes('pharaoh')) return 'PHS';
  // Treat Collector's Rare as Prismatic Collector (PC)
  if (norm.includes('collector')) return 'PC';
  if (norm.includes('ultimate')) return 'ULT';
  if (norm.includes('ultra')) return 'UL';
  if (norm.includes('super')) return 'SU';
  if (norm.includes('secret')) return 'SEC';
  if (norm.includes('rare')) return 'RA';
  if (norm.includes('common') || norm.includes('comun')) return 'CO';
  return norm.split(' ').map(w => w[0] ? w[0].toUpperCase() : '').join('').slice(0,3).toUpperCase();
}

function detectType(tags, cardName) {
  const s = (String(tags || '') + ' ' + String(cardName || '')).toLowerCase();
  if (/\b(spell|spell card|spellcard|magia|magic)\b/.test(s)) return 'Spell';
  if (/\b(trap|trampa|trap card|trapcard)\b/.test(s)) return 'Trap';
  if (/\b(xyz)\b/.test(s)) return 'Xyz';
  if (/\b(link)\b/.test(s)) return 'Link';
  if (/\b(normal|normal monster)\b/.test(s)) return 'Normal Monster';
  if (/\b(fusion)\b/.test(s)) return 'Fusion';
  if (/\b(pendulum)\b/.test(s)) return 'Pendulum';
  if (/\b(synchro|syncrho)\b/.test(s)) return 'Synchro';
  if (/\b(ritual)\b/.test(s)) return 'Ritual';
  if (/\b(token)\b/.test(s)) return 'Token';
  if (/\b(skill)\b/.test(s)) return 'Skill Card';
  if (/\b(field)\b/.test(s)) return 'Field Center';
  if (/\b(effect)\b/.test(s)) return 'Effect Monster';
  if (/\b(monster|monstruo)\b/.test(s)) return 'Effect Monster';
  return null;
}

const _typeCache = new Map();
async function fetchTypeFromYGO(cardName) {
  if (!cardName) return 'Monstruo';
  if (_typeCache.has(cardName)) return _typeCache.get(cardName);
  try {
    const res = await axios.get('https://db.ygoprodeck.com/api/v7/cardinfo.php', { params: { name: cardName }, timeout: 10000 });
    if (res && res.data && res.data.data && res.data.data.length) {
      const typeStr = (res.data.data[0].type || '').toLowerCase();
      let mapped = 'Effect Monster';
      if (/spell/i.test(typeStr)) mapped = 'Spell';
      else if (/trap/i.test(typeStr)) mapped = 'Trap';
      else if (/xyz/i.test(typeStr)) mapped = 'Xyz';
      else if (/link/i.test(typeStr)) mapped = 'Link';
      else if (/normal/i.test(typeStr)) mapped = 'Normal Monster';
      else if (/fusion/i.test(typeStr)) mapped = 'Fusion';
      else if (/pendulum/i.test(typeStr)) mapped = 'Pendulum';
      else if (/synchro|syncrho/i.test(typeStr)) mapped = 'Synchro';
      else if (/ritual/i.test(typeStr)) mapped = 'Ritual';
      else if (/token/i.test(typeStr)) mapped = 'Token';
      else if (/skill/i.test(typeStr)) mapped = 'Skill Card';
      else if (/field/i.test(typeStr)) mapped = 'Field Center';
      else if (/effect/i.test(typeStr) || /monster/i.test(typeStr)) mapped = 'Effect Monster';
      _typeCache.set(cardName, mapped);
      return mapped;
    }
  } catch (err) {
    try {
      const res2 = await axios.get('https://db.ygoprodeck.com/api/v7/cardinfo.php', { params: { fname: cardName }, timeout: 10000 });
      if (res2 && res2.data && res2.data.data && res2.data.data.length) {
        const typeStr = (res2.data.data[0].type || '').toLowerCase();
        let mapped = 'Effect Monster';
        if (/spell/i.test(typeStr)) mapped = 'Spell';
        else if (/trap/i.test(typeStr)) mapped = 'Trap';
        else if (/xyz/i.test(typeStr)) mapped = 'Xyz';
        else if (/link/i.test(typeStr)) mapped = 'Link';
        else if (/normal/i.test(typeStr)) mapped = 'Normal Monster';
        else if (/fusion/i.test(typeStr)) mapped = 'Fusion';
        else if (/pendulum/i.test(typeStr)) mapped = 'Pendulum';
        else if (/synchro|syncrho/i.test(typeStr)) mapped = 'Synchro';
        else if (/ritual/i.test(typeStr)) mapped = 'Ritual';
        else if (/token/i.test(typeStr)) mapped = 'Token';
        else if (/skill/i.test(typeStr)) mapped = 'Skill Card';
        else if (/field/i.test(typeStr)) mapped = 'Field Center';
        else if (/effect/i.test(typeStr) || /monster/i.test(typeStr)) mapped = 'Effect Monster';
        _typeCache.set(cardName, mapped);
        return mapped;
      }
    } catch (err2) {
      // ignore
    }
  }
  _typeCache.set(cardName, 'Effect Monster');
  return 'Effect Monster';
}

function stripRarityFromName(rawName, rarityText) {
  if (!rawName) return '';
  let name = String(rawName).trim();
  const keywords = [
    'rare', 'collector', "collector's", 'secret', 'ultra', 'ultimate', 'platinum', 'ghost', 'gold', 'starlight', 'prismatic', 'mosaic'
  ];

  const paren = name.match(/^(.*)\s*\(([^)]+)\)\s*$/);
  if (paren) {
    const inside = paren[2].toLowerCase();
    if (keywords.some(k => inside.includes(k))) return paren[1].trim();
  }

  const dash = name.match(/^(.*)\s+-\s+(.+)$/);
  if (dash) {
    const suffix = dash[2].toLowerCase();
    if (keywords.some(k => suffix.includes(k))) return dash[1].trim();
  }

  if (rarityText) {
    const rnorm = String(rarityText).toLowerCase().trim();
    if (rnorm && name.toLowerCase().endsWith(rnorm)) {
      return name.slice(0, -rnorm.length).replace(/[-\s]+$/,'').trim();
    }
  }

  return name;
}

function canonicalRarity(rarityText) {
  const s = String(rarityText || '').toLowerCase();
  if (!s) return '';
  if (s.includes('platinum secret')) return 'Platinum Secret';
  if (s.includes('prismatic secret')) return 'Prismatic Secret';
  if (s.includes('prismatic collector')) return 'Prismatic Collector';
  if (s.includes('prismatic ultimate')) return 'Prismatic Ultimate';
  if (s.includes('ghost gold')) return 'Ghost Gold';
  if (s.includes('ghost')) return 'Ghost';
  if (s.includes('gold secret')) return 'Gold Secret';
  if (s.includes('rare gold') || s.includes('gold rare')) return 'Rare Gold';
  if (s.includes('starfoil') || s.includes('starfoil rare')) return 'Starfoil';
  if (s.includes('starlight')) return 'Starlight';
  if (s.includes('pharaoh')) return 'Pharaoh';
  // Treat Collector's Rare as Prismatic Collector (page error)
  if (s.includes('collector')) return 'Prismatic Collector';
  if (s.includes('ultimate')) return 'Ultimate';
  if (s.includes('ultra')) return 'Ultra';
  if (s.includes('super')) return 'Super';
  if (s.includes('secret')) return 'Secret';
  if (s.includes('rare') || s.includes("collector's rare") ) return 'Rare';
  if (s.includes('common') || s.includes('comun')) return 'Common';
  return rarityText;
}

function rewriteUrlName(name) {
  if (!name) return '';
  // remove characters that could break URL, keep case, replace spaces with hyphens
  return String(name)
    .replace(/[()\[\]\.,;:'"“”‘’]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function transformImageUrl(url) {
  if (!url) return '';
  try {
    return String(url).replace(/_200w\.(jpg|png)(\?.*)?$/i, '_in_1000x1000.$1');
  } catch (e) {
    return url;
  }
}

async function mapRowToTemplate(csvRow) {
  const mapped = {};

  const editionCode = getCsvVal(csvRow, ['editionCode', 'edition_code']) || '';
  const editionName = getCsvVal(csvRow, ['editionName', 'edition_name']) || '';
  const rarity = getCsvVal(csvRow, ['rarity']) || '';
  const tags = getCsvVal(csvRow, ['tags']) || '';
  const cardName = getCsvVal(csvRow, ['cardName', 'card_name', 'card']) || '';
  const cardNumber = getCsvVal(csvRow, ['cardNumber', 'card_number', 'cardCode', 'card_code']) || '';
  const condition = getCsvVal(csvRow, ['condition']) || '';
  const imageUrl = getCsvVal(csvRow, ['imageUrl', 'image_url', 'image']) || '';
  // derive language from card number (e.g., RA05-EN001) or fallback to EN
  let language = 'EN';
  const m = String(cardNumber).match(/-([A-Z]{2,3})/i);
  if (m) language = m[1].toUpperCase();
  const clp = computeCLP(csvRow);
  const cleanedName = stripRarityFromName(cardName, rarity);

  function slugify(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  for (const header of tplHeaders) {
    const hRaw = String(header || '');
    const h = hRaw.trim();
    const hLower = h.toLowerCase();

    if (!h) {
      mapped[header] = '';
      continue;
    }

    // Reference: editionCode/SIGLA/LANG
    if (hLower === 'reference') {
      const sigla = getSigla(rarity);
      const ed = editionCode || editionName || '';
      mapped[header] = `${ed}/${sigla || ''}/${language}`;
      continue;
    }

    // Categories: editionName,Singles Ygo
    if (hLower === 'categories' || hLower === 'category') {
      const catEd = editionName || editionCode || '';
      mapped[header] = `${catEd},Singles Ygo`;
      continue;
    }

    if (hLower === 'weight') {
      mapped[header] = 0.002;
      continue;
    }

    if (hLower === 'name') {
      mapped[header] = cleanedName || '';
      continue;
    }

    if (hLower === 'image urls' || hLower === 'image url' || hLower === 'images') {
      mapped[header] = transformImageUrl(imageUrl) || '';
      continue;
    }

    if (hLower === 'price' || hLower === 'precio') {
      mapped[header] = clp;
      continue;
    }

    if (hLower === 'url rewritten') {
      // card name with hyphens instead of spaces
      mapped[header] = rewriteUrlName(cleanedName) || '';
      continue;
    }

    // Meta title, keywords, description, Resumen: all the same -> edition - cardName
    if (hLower === 'meta title' || hLower === 'meta keywords' || hLower === 'meta description' || hLower === 'resumen') {
      const ed = editionName || editionCode || '';
      mapped[header] = `${ed} - ${cleanedName}`.trim();
      continue;
    }

    if (hLower === 'caracteristicas' || hLower === 'características') {
      // use canonical rarity (no 'Rare' suffixes), type and language
      const rareCanon = canonicalRarity(rarity) || '';
      let tipo = detectType(tags, cleanedName);
      if (!tipo) {
        tipo = await fetchTypeFromYGO(cleanedName);
      }
      mapped[header] = `Rareza:${rareCanon},Tipo:${tipo},Idioma:${language}`;
      continue;
    }

    // Fallback generic mappings
    if (hLower.includes('quantity') || hLower.includes('qty') || hLower.includes('stock')) {
      mapped[header] = getCsvVal(csvRow, ['quantity', 'qty']) || 0;
      continue;
    }

    if (hLower.includes('condition')) {
      mapped[header] = condition || '';
      continue;
    }

    if (hLower.includes('rarity')) {
      mapped[header] = rarity || '';
      continue;
    }

    if (hLower.includes('edition') || hLower.includes('set')) {
      mapped[header] = editionName || editionCode || '';
      continue;
    }

    if ((hLower.includes('card') && hLower.includes('number')) || hLower.includes('cardnumber') || hLower.includes('card_no')) {
      mapped[header] = cardNumber || '';
      continue;
    }

    // Default: try direct key from CSV
    mapped[header] = getCsvVal(csvRow, [hRaw]) || '';
  }

  return mapped;
}

// Build output rows starting with template headers and optionally fetch types remotely
(async () => {
  // Read template and populate headers
  const tplWb = new ExcelJS.Workbook();
  await tplWb.xlsx.readFile(TEMPLATE_PATH);
  const tplSheet = tplWb.worksheets[0];
  tplSheetName = tplSheet.name || 'Sheet1';
  const firstRow = tplSheet.getRow(1).values.slice(1);
  tplHeaders = firstRow.map((v) => (v === null || v === undefined) ? '' : String(v));

  console.log('Detected template headers (first row):');
  console.log(tplHeaders.join(' | '));

  // Read CSV into objects using csv-parse
  const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
  csvData = parse(csvContent, { columns: true, skip_empty_lines: true, relax_column_count: true });

  const outRows = [tplHeaders];
  for (const row of csvData) {
    const editionCode = String(getCsvVal(row, ['editionCode', 'edition_code']) || '').toUpperCase();
    if (editionCode !== 'RA05') continue;
    const mapped = await mapRowToTemplate(row);
    const arr = tplHeaders.map(h => {
      const v = mapped[h];
      if (typeof v === 'number' && !Number.isNaN(v)) return v;
      if (v === null || v === undefined) return '';
      return String(v);
    });
    outRows.push(arr);
  }

  // Build output workbook using ExcelJS
  const outWb = new ExcelJS.Workbook();
  const outWs = outWb.addWorksheet(tplSheetName);
  for (const r of outRows) {
    outWs.addRow(r);
  }
  await outWb.xlsx.writeFile(OUTPUT_PATH);
  console.log('Wrote', OUTPUT_PATH);
})();

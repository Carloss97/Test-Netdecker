// scripts/scrape-tcgplayer-prices.js
// Node.js script to scrape TCGplayer prices and export to CSV for batch import
// Usage: node scripts/scrape-tcgplayer-prices.js <setUrl> <output.csv>

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function scrapeSet(setUrl) {
  const { data: html } = await axios.get(setUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TCGScraper/1.0)'
    }
  });
  const $ = cheerio.load(html);
  const rows = [];

  // TCGplayer set page: each card row has a link and price info
  $('.search-result').each((_, el) => {
    const cardName = $(el).find('.productDetail a').text().trim();
    const editionCode = $(el).find('.setName').text().trim();
    const cardCode = $(el).find('.productDetail .sku').text().trim();
    const priceMarket = $(el).find('.marketPrice .price').text().replace('$', '').trim();
    const priceLow = $(el).find('.lowPrice .price').text().replace('$', '').trim();
    const priceMid = $(el).find('.midPrice .price').text().replace('$', '').trim();
    if (!cardName) return;
    rows.push({
      tcg: 'POKEMON', // Cambia según el set
      editionCode,
      cardCode,
      cardName,
      priceMarket,
      priceLow,
      priceMid
    });
  });
  return rows;
}

async function main() {
  const [,, setUrl, output] = process.argv;
  if (!setUrl || !output) {
    console.error('Usage: node scripts/scrape-tcgplayer-prices.js <setUrl> <output.csv>');
    process.exit(1);
  }
  const cards = await scrapeSet(setUrl);
  const header = 'tcg,editionCode,cardCode,cardName,priceMarket,priceLow,priceMid\n';
  const csv = header + cards.map(c => [c.tcg, c.editionCode, c.cardCode, c.cardName, c.priceMarket, c.priceLow, c.priceMid].join(',')).join('\n');
  fs.writeFileSync(output, csv);
  console.log(`Exported ${cards.length} cards to ${output}`);
}

main().catch(err => { console.error(err); process.exit(1); });

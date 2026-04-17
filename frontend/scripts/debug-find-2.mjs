import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/admin/stores', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const html = await page.content();
  const needle = 'Stores';
  const idx = html.indexOf(needle);
  console.log('found Stores?', idx !== -1, 'idx=', idx);
  if (idx !== -1) console.log(html.substring(Math.max(0, idx-120), idx+120));
  await browser.close();
})();

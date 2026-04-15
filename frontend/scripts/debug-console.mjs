import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('CONSOLE[' + msg.type() + ']', msg.text()));
  page.on('pageerror', (err) => console.log('PAGEERROR', err.message));
  await page.goto('http://localhost:3000/admin/stores', { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  console.log('Done waiting');
  await browser.close();
})();

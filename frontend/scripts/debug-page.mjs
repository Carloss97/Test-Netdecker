import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/admin/stores', { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  const html = await page.content();
  console.log(html.substring(0, 2000));
  await browser.close();
})();

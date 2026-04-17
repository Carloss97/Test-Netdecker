const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const logs = [];

  page.on('console', (msg) => {
    try {
      logs.push({ type: msg.type(), text: msg.text() });
    } catch (e) {
      logs.push({ type: 'console', text: String(e) });
    }
  });

  page.on('pageerror', (err) => {
    logs.push({ type: 'pageerror', text: String(err) });
  });

  const url = 'https://7a3d08fe.netdeckerp.pages.dev';
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  console.log('\n=== PLAYWRIGHT CONSOLE LOGS START ===\n');
  console.log(JSON.stringify(logs, null, 2));
  console.log('\n=== PAGE HTML START (truncated 10240 chars) ===\n');
  const html = await page.content();
  console.log(html.slice(0, 10240));

  await browser.close();
})();

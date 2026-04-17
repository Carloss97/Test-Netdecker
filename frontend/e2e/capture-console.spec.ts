import { test } from '@playwright/test';

test('capture console and page errors from Pages deployment', async ({ page }) => {
  const logs: Array<{ type: string; text: string }> = [];

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

  // give app a moment to mount
  await page.waitForTimeout(1500);

  // print results so runner output contains them
  console.log('\n=== PLAYWRIGHT CONSOLE LOGS START ===\n');
  console.log(JSON.stringify(logs, null, 2));
  console.log('\n=== PAGE HTML START (truncated 10240 chars) ===\n');
  const html = await page.content();
  console.log(html.slice(0, 10240));
  console.log('\n=== PLAYWRIGHT CAPTURE END ===\n');
});

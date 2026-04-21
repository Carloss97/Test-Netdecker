# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: capture-console.spec.ts >> capture console and page errors from Pages deployment
- Location: e2e\capture-console.spec.ts:3:1

# Error details

```
Error: page.goto: net::ERR_NAME_NOT_RESOLVED at https://7a3d08fe.netdeckerp.pages.dev/
Call log:
  - navigating to "https://7a3d08fe.netdeckerp.pages.dev/", waiting until "networkidle"

```

# Test source

```ts
  1  | import { test } from '@playwright/test';
  2  | 
  3  | test('capture console and page errors from Pages deployment', async ({ page }) => {
  4  |   const logs: Array<{ type: string; text: string }> = [];
  5  | 
  6  |   page.on('console', (msg) => {
  7  |     try {
  8  |       logs.push({ type: msg.type(), text: msg.text() });
  9  |     } catch (e) {
  10 |       logs.push({ type: 'console', text: String(e) });
  11 |     }
  12 |   });
  13 | 
  14 |   page.on('pageerror', (err) => {
  15 |     logs.push({ type: 'pageerror', text: String(err) });
  16 |   });
  17 | 
  18 |   const url = 'https://7a3d08fe.netdeckerp.pages.dev';
> 19 |   await page.goto(url, { waitUntil: 'networkidle' });
     |              ^ Error: page.goto: net::ERR_NAME_NOT_RESOLVED at https://7a3d08fe.netdeckerp.pages.dev/
  20 | 
  21 |   // give app a moment to mount
  22 |   await page.waitForTimeout(1500);
  23 | 
  24 |   // print results so runner output contains them
  25 |   console.log('\n=== PLAYWRIGHT CONSOLE LOGS START ===\n');
  26 |   console.log(JSON.stringify(logs, null, 2));
  27 |   console.log('\n=== PAGE HTML START (truncated 10240 chars) ===\n');
  28 |   const html = await page.content();
  29 |   console.log(html.slice(0, 10240));
  30 |   console.log('\n=== PLAYWRIGHT CAPTURE END ===\n');
  31 | });
  32 | 
```
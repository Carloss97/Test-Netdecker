# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: capture-console.spec.ts >> capture console and page errors from Pages deployment
- Location: e2e\capture-console.spec.ts:3:1

# Error details

```
Error: page.goto: NS_ERROR_UNKNOWN_HOST
Call log:
  - navigating to "https://7a3d08fe.netdeckerp.pages.dev/", waiting until "networkidle"

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - heading "Hmm. We’re having trouble finding that site." [level=1] [ref=e5]
    - paragraph [ref=e6]: We can’t connect to the server at 7a3d08fe.netdeckerp.pages.dev.
    - paragraph
    - generic [ref=e7]:
      - strong [ref=e9]: "If you entered the right address, you can:"
      - list [ref=e10]:
        - listitem [ref=e11]: Try again later
        - listitem [ref=e12]: Check your network connection
        - listitem [ref=e13]: Check that Nightly has permission to access the web (you might be connected but behind a firewall)
  - button "Try Again" [active] [ref=e15]
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
     |              ^ Error: page.goto: NS_ERROR_UNKNOWN_HOST
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
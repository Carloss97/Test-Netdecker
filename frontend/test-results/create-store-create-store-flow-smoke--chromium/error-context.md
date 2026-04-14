# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: create-store.spec.ts >> create store flow (smoke)
- Location: e2e\create-store.spec.ts:3:1

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('text=E2E Store')
Expected: 1
Received: 0
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" with timeout 5000ms
  - waiting for locator('text=E2E Store')
    9 × locator resolved to 0 elements
      - unexpected value "0"

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: 🃏 Netdecker
      - generic [ref=e7]: TCG Store Platform
    - navigation [ref=e8]:
      - link "🏠 Dashboard" [ref=e9] [cursor=pointer]:
        - /url: /
        - generic [ref=e10]: 🏠
        - text: Dashboard
      - link "💳 POS" [ref=e11] [cursor=pointer]:
        - /url: /pos
        - generic [ref=e12]: 💳
        - text: POS
      - link "📦 Inventario" [ref=e13] [cursor=pointer]:
        - /url: /inventario
        - generic [ref=e14]: 📦
        - text: Inventario
      - link "💰 Precios" [ref=e15] [cursor=pointer]:
        - /url: /precios
        - generic [ref=e16]: 💰
        - text: Precios
      - link "🚨 Stock Bajo" [ref=e17] [cursor=pointer]:
        - /url: /stock-bajo
        - generic [ref=e18]: 🚨
        - text: Stock Bajo
      - link "📥 Importar" [ref=e19] [cursor=pointer]:
        - /url: /importar
        - generic [ref=e20]: 📥
        - text: Importar
      - link "🔍 Buscar Carta" [ref=e21] [cursor=pointer]:
        - /url: /buscar
        - generic [ref=e22]: 🔍
        - text: Buscar Carta
      - link "⚙️ Admin" [ref=e23] [cursor=pointer]:
        - /url: /admin
        - generic [ref=e24]: ⚙️
        - text: Admin
    - generic [ref=e25]: v0.1.0 · Internal Tool
  - generic [ref=e26]:
    - banner [ref=e27]:
      - heading "TCG Platform" [level=1] [ref=e29]
    - main [ref=e30]:
      - generic [ref=e31]:
        - heading "Stores" [level=1] [ref=e32]
        - button "New Store" [ref=e34]
        - generic [ref=e35]:
          - generic [ref=e36]: Request failed with status code 500
          - generic [ref=e37]:
            - text: Slug
            - textbox "Slug" [ref=e38]: e2e-s1
          - generic [ref=e39]:
            - text: Name
            - textbox "Name" [ref=e40]: E2E Store
          - generic [ref=e41]:
            - text: Description
            - textbox "Description" [ref=e42]
          - generic [ref=e43]:
            - text: Currency
            - textbox "Currency" [ref=e44]: USD
          - generic [ref=e45]:
            - text: Tax Rate
            - spinbutton "Tax Rate" [ref=e46]
          - generic [ref=e47]:
            - button "Save" [ref=e48]
            - button "Cancel" [ref=e49]
        - table [ref=e50]:
          - rowgroup [ref=e51]:
            - row "Slug Name Currency Tax Rate" [ref=e52]:
              - columnheader "Slug" [ref=e53]
              - columnheader "Name" [ref=e54]
              - columnheader "Currency" [ref=e55]
              - columnheader "Tax Rate" [ref=e56]
              - columnheader [ref=e57]
          - rowgroup
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test('create store flow (smoke)', async ({ page }) => {
  4  |   await page.goto('/admin/stores');
  5  | 
  6  |   // Click 'New Store' button
  7  |   await page.click('text=New Store');
  8  | 
  9  |   // Fill form
  10 |   await page.fill('input#slug', 'e2e-s1');
  11 |   await page.fill('input#name', 'E2E Store');
  12 |   await page.fill('input#currency', 'USD');
  13 | 
  14 |   // Save
  15 |   await page.click('text=Save');
  16 | 
  17 |   // Expect the created store to appear in list (app must hit real API or mocked)
> 18 |   await expect(page.locator('text=E2E Store')).toHaveCount(1);
     |                                                ^ Error: expect(locator).toHaveCount(expected) failed
  19 | });
  20 | 
```
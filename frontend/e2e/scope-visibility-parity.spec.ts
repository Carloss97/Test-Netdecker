import { test, expect } from '@playwright/test';

type Scenario = 'global-with-store' | 'scoped-store';

function installScopeMocks(page: import('@playwright/test').Page, scenario: Scenario) {
  const isScoped = scenario === 'scoped-store';
  const mePayload = isScoped
    ? { id: 'admin-scoped', role: 'ADMIN', email: 'scoped@test.com', storeId: 'store-1', resolvedStoreId: 'store-1', scopeMode: 'session-store-scoped' }
    : { id: 'admin-global', role: 'ADMIN', email: 'global@test.com', storeId: null, resolvedStoreId: 'store-1', scopeMode: 'request-store-scoped' };

  const availableListings = [
    {
      id: 'listing-1',
      quantity: 7,
      status: 'active',
      condition: 'NM',
      editionId: 'ED1',
      finalPrice: 1500,
      referencePrice: 1.5,
      card: {
        cardName: 'Scoped Card 1',
        cardCode: 'SC-001',
        rarity: 'Rare',
        tcg: { name: 'MAGIC' },
        edition: { editionCode: 'ED1', editionName: 'Edition 1' },
      },
    },
    {
      id: 'listing-2',
      quantity: 2,
      status: 'manual',
      condition: 'NM',
      editionId: 'ED1',
      finalPrice: 1800,
      referencePrice: 1.8,
      card: {
        cardName: 'Scoped Card 2',
        cardCode: 'SC-002',
        rarity: 'Uncommon',
        tcg: { name: 'MAGIC' },
        edition: { editionCode: 'ED1', editionName: 'Edition 1' },
      },
    },
  ];

  const lowStockListings = [availableListings[1]];

  page.route('**/api/admin/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: mePayload }),
    });
  });

  page.route('**/api/admin/stores', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, stores: [{ id: 'store-1', slug: 'store-one', name: 'Store One' }] }),
    });
  });

  page.route('**/api/admin/tenant/visibility-diagnostics**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        diagnostics: {
          resolvedStoreId: 'store-1',
          scopeMode: 'store-scoped',
          threshold: 5,
          counts: {
            inventoryListings: 4,
            pricingListings: 2,
            lowStockListings: 1,
            storefrontListings: 2,
          },
          filters: {
            pricingStatuses: ['active', 'manual'],
            storefrontStatuses: ['active', 'manual'],
          },
        },
      }),
    });
  });

  page.route('**/api/admin/price-volatility**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, total: 0, events: [] }),
    });
  });

  page.route('**/api/listings/available**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(availableListings),
    });
  });

  page.route('**/api/listings/low-stock**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(lowStockListings),
    });
  });

  page.route('**/api/listings?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'inv-1' },
        { id: 'inv-2' },
        { id: 'inv-3' },
        { id: 'inv-4' },
      ]),
    });
  });
}

test.describe('scope visibility parity', () => {
  test('scoped admin: no pricing-config request and listings visible across pricing/low-stock/storefront', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('auth_token', 'e2e-token');
      window.localStorage.setItem('auth_store', 'store-1');
    });

    installScopeMocks(page, 'scoped-store');

    let pricingConfigCalls = 0;
    await page.route('**/api/admin/pricing-config', async (route) => {
      pricingConfigCalls += 1;
      await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ success: false }) });
    });

    await page.goto('/admin');
    await expect(page.getByText(/Scope:/).first()).toBeVisible();
    await expect(page.getByText(/Store:/).first()).toBeVisible();
    await expect(page.getByText('Diagnóstico de Visibilidad por Tenant')).toBeVisible();

    await page.goto('/precios');
    await expect(page.locator('.data-table').getByText('Scoped Card 1').first()).toBeVisible();
    await expect(page.locator('.data-table').getByText('Scoped Card 2').first()).toBeVisible();

    await page.goto('/stock-bajo');
    await expect(page.locator('.data-table').getByText('Scoped Card 2').first()).toBeVisible();

    await page.goto('/storefront');
    await expect(page.getByText('Scoped Card 1').first()).toBeVisible();
    await expect(page.getByText('Scoped Card 2').first()).toBeVisible();

    expect(pricingConfigCalls).toBe(0);
  });

  test('global admin with active store: pricing-config can be queried and same listings parity is preserved', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('auth_token', 'e2e-token');
      window.localStorage.setItem('auth_store', 'store-1');
    });

    installScopeMocks(page, 'global-with-store');

    let pricingConfigCalls = 0;
    await page.route('**/api/admin/pricing-config', async (route) => {
      pricingConfigCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          config: {
            defaultMarginMultiplier: 1.2,
            exchangeRate: { mode: 'manual', activeRate: 950 },
            importSetSyncPricesDefault: true,
          },
        }),
      });
    });

    await page.goto('/admin');
    await expect(page.getByText('Diagnóstico de Visibilidad por Tenant')).toBeVisible();

    await page.goto('/precios');
    await expect(page.locator('.data-table').getByText('Scoped Card 1').first()).toBeVisible();

    await page.goto('/stock-bajo');
    await expect(page.locator('.data-table').getByText('Scoped Card 2').first()).toBeVisible();

    await page.goto('/storefront');
    await expect(page.getByText('Scoped Card 1').first()).toBeVisible();

    expect(pricingConfigCalls).toBeGreaterThan(0);
  });
});

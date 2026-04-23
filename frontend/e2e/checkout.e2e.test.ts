import { test, expect } from '@playwright/test';

test('POS checkout flow completes with mocked backend', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('auth_token', 'e2e-token');
  });

  await page.route('**/api/admin/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { id: 'admin-1', role: 'ADMIN', email: 'admin@test.com' } }),
    });
  });

  await page.route('**/api/cards/search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'card-1', cardName: 'Charizard', edition: { editionCode: 'SET-1' } },
      ]),
    });
  });

  await page.route('**/api/listings/card/card-1', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        listings: [
          { id: 'listing-1', condition: 'NM', rarity: 'Rare', quantity: 3, finalPrice: 1500 },
        ],
      }),
    });
  });

  await page.route('**/api/payments/pos-sale', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, order: { id: 'ord-1' } }),
    });
  });

  await page.goto('/pos');

  await page.fill('input[aria-label="buscar"]', 'Charizard');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByRole('button', { name: 'Ver listings' }).click();
  await page.getByRole('button', { name: 'Agregar' }).click();

  await expect(page.getByText('NM Rare')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar venta' }).click();

  await expect(page.getByText('Venta registrada correctamente')).toBeVisible();
});

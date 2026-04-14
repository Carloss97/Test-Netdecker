import { test, expect } from '@playwright/test';

test('create store flow (smoke)', async ({ page }) => {
  await page.goto('/');

  // Click 'New Store' button
  await page.click('text=New Store');

  // Fill form
  await page.fill('input#slug', 'e2e-s1');
  await page.fill('input#name', 'E2E Store');
  await page.fill('input#currency', 'USD');

  // Save
  await page.click('text=Save');

  // Expect the created store to appear in list (app must hit real API or mocked)
  await expect(page.locator('text=E2E Store')).toHaveCount(1);
});

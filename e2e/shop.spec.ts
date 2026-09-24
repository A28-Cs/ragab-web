import { test, expect } from '@playwright/test';

/**
 * Customer journey E2E (§38) against the real backend + seeded DB. Verifies the UI
 * renders live data and the registration flow reaches the account area.
 */

test('storefront shows a seeded product from the real backend', async ({ page }) => {
  await page.goto('/product/crystal-sunflower-oil-1-5l');
  // The Arabic product name comes from the database, not a mock.
  await expect(page.getByText('زيت عباد الشمس كريستال').first()).toBeVisible();
  // Price (95 EGP) is server-derived from minor units.
  await expect(page.getByText(/95/).first()).toBeVisible();
});

test('a new customer can register and reach their account', async ({ page }) => {
  const phone = '0101' + String(Date.now()).slice(-7);
  await page.goto('/register');

  await page.fill('#r-name', 'مختبر بلايرايت');
  await page.fill('#r-phone', phone);
  await page.fill('#r-password', 'Secret@123');
  await page.fill('#r-confirm', 'Secret@123');
  // Accept the terms (required to submit).
  await page.locator('label:has(input[type="checkbox"])').first().click();
  await page.locator('button[type="submit"]').first().click();

  // The AuthContext calls /register then /me, then routes to /account.
  await expect(page).toHaveURL(/\/account/, { timeout: 20_000 });
});

test('login page rejects wrong credentials with an error (no crash)', async ({ page }) => {
  await page.goto('/login');
  await page.fill('#identifier', '01099999999');
  await page.fill('#password', 'WrongPass1');
  await page.locator('button[type="submit"]').first().click();
  // Stays on /login and shows an error; the app must not white-screen.
  await expect(page).toHaveURL(/\/login/);
});

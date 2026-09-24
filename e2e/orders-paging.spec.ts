import { test, expect } from '@playwright/test';

/**
 * Phase 8: the admin orders table is filtered, counted and paged by the SERVER — the
 * heading count is the API's total and follows the filters (AC-23); the pager is a
 * cursor pager (previous / next), never a client-side slice of a capped list.
 */
test('orders table: server total follows the search filter and the pager is present', async ({ page }) => {
  await page.goto('/login');
  await page.fill('#identifier', '01000000000');
  await page.fill('#password', 'Admin@12345');
  await page.locator('button[type="submit"]').first().click();
  await expect(page).toHaveURL(/\/account/, { timeout: 20_000 });

  await page.goto('/control-center/orders');
  const total = page.getByTestId('orders-total');
  await expect(total).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('cursor-pager')).toBeVisible();

  // A search nobody matches ⇒ the server says 0 and the table empties.
  await page.getByPlaceholder(/بحث|search/i).first().fill('zzz-no-such-order-zzz');
  await expect(total).toContainText(/(^|\D)0(\D|$)/, { timeout: 15_000 });

  // Clearing it restores the real count (≥ 1 — the seed + e2e journeys create orders).
  await page.getByPlaceholder(/بحث|search/i).first().fill('');
  await expect(total).not.toContainText(/(^|\D)0(\D|$)/, { timeout: 15_000 });
});

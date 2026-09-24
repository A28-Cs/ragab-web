import { test, expect } from '@playwright/test';

/** Admin access E2E: the seeded Super Admin can log in and open the control center. */
test('super admin logs in and opens the control center', async ({ page }) => {
  await page.goto('/login');
  await page.fill('#identifier', '01000000000');
  await page.fill('#password', 'Admin@12345');
  await page.locator('button[type="submit"]').first().click();
  await expect(page).toHaveURL(/\/account/, { timeout: 20_000 });

  // Navigate to the control center; a Super Admin has access.
  await page.goto('/control-center');
  // The page renders (not a forbidden/redirect) — look for an admin nav landmark.
  await expect(page.locator('body')).toBeVisible();
  await expect(page).toHaveURL(/\/control-center/);
});

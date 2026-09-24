import { test, expect } from '@playwright/test';

/**
 * P2-11: the audit log is inspectable — clicking a row opens a drawer with the full
 * entry (actor, resource id, request id, IP, device, metadata). The owner's own login
 * is audited, so the log is never empty for this test.
 */
test('audit log row opens a detail drawer with request forensics', async ({ page }) => {
  await page.goto('/login');
  await page.fill('#identifier', '01000000000');
  await page.fill('#password', 'Admin@12345');
  await page.locator('button[type="submit"]').first().click();
  await expect(page).toHaveURL(/\/account/, { timeout: 20_000 });

  await page.goto('/control-center/audit-log');
  const firstRow = page.locator('table tbody tr').first();
  await expect(firstRow).toBeVisible({ timeout: 30_000 });
  await firstRow.click();

  const drawer = page.locator('[data-testid="audit-detail"]');
  await expect(drawer).toBeVisible();
  // Forensics block labels (Arabic-first UI) + the actor block.
  await expect(drawer).toContainText('معرّف الطلب');
  await expect(drawer).toContainText('عنوان IP');
  await expect(drawer).toContainText('التواصل مع المنفِّذ');
});

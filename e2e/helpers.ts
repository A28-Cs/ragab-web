import { expect, type Page } from '@playwright/test';

/** Register a brand-new customer (unique phone) and land on the account page. */
export async function registerFreshCustomer(page: Page, name = 'مختبر السلة'): Promise<string> {
  const phone = '0102' + String(Date.now()).slice(-7);
  await page.goto('/register');
  await page.fill('#r-name', name);
  await page.fill('#r-phone', phone);
  await page.fill('#r-password', 'Secret@123');
  await page.fill('#r-confirm', 'Secret@123');
  await page.locator('label:has(input[type="checkbox"])').first().click();
  await page.locator('button[type="submit"]').first().click();
  await expect(page).toHaveURL(/\/account/, { timeout: 20_000 });
  return phone;
}

/** Add the seeded oil from its product page, then fill a new delivery address on checkout. */
export async function addOilAndStartCheckout(page: Page): Promise<void> {
  await page.goto('/product/crystal-sunflower-oil-1-5l');
  await page.getByRole('button', { name: /أضف إلى السلة/ }).first().click();
  await page.goto('/checkout');
  await page.fill('#co-name', 'مختبر السلة');
  await page.fill('#co-phone', '01022223333');
  await page.selectOption('#co-village', { index: 1 });
  await page.fill('#co-street', 'شارع الاختبار 1');
  await page.getByRole('button', { name: /استخدم هذا العنوان/ }).click();
  await page.getByRole('button', { name: /طريقة الدفع/ }).click();
}

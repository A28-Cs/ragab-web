import { test, expect } from '@playwright/test';
import { registerFreshCustomer } from './helpers';

/**
 * Regression journey for two audit findings:
 *   1. the cart must live on the server (it survives a reload and is the same cart the
 *      mobile app sees) — not in localStorage;
 *   2. "cancel order" must really cancel (it used to be a setTimeout + local state), so
 *      the status is still «ملغي» after a reload and the payment cannot be confirmed.
 */

test('cart persists on the server across reloads, checkout uses a saved address, and cancel really cancels', async ({ page }) => {
  test.setTimeout(120_000);
  await registerFreshCustomer(page);

  // Add a seeded product from its page.
  await page.goto('/product/crystal-sunflower-oil-1-5l');
  await page.getByRole('button', { name: /أضف إلى السلة/ }).first().click();

  // A hard reload must show the same cart — it is the SERVER cart, not localStorage.
  await page.goto('/cart');
  await page.reload();
  await expect(page.getByText('زيت عباد الشمس كريستال').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.evaluate(() => localStorage.getItem('ragab_cart'))).resolves.toBeNull();

  // Checkout: save a new address, choose COD, place the order.
  await page.goto('/checkout');
  await page.fill('#co-name', 'مختبر السلة');
  await page.fill('#co-phone', '01022223333');
  await page.selectOption('#co-village', { index: 1 });
  await page.fill('#co-street', 'شارع الاختبار 1');
  await page.getByRole('button', { name: /استخدم هذا العنوان/ }).click();
  await page.getByRole('button', { name: /طريقة الدفع/ }).click();
  await page.getByRole('button', { name: /مراجعة الطلب/ }).click();
  // The summary shows the server quote before the order can be placed.
  await expect(page.getByText(/الإجمالي النهائي/).first()).toBeVisible();
  await page.getByRole('button', { name: /تأكيد وإرسال الطلب/ }).click();
  await expect(page).toHaveURL(/\/order-success\?orderId=/, { timeout: 30_000 });

  // The success page shows the payment step it was handed (COD note) and links to the order.
  await expect(page.getByText(/ادفع نقدًا لمندوب التوصيل/)).toBeVisible();
  await page.getByRole('link', { name: /تتبّع الطلب/ }).click();
  await expect(page).toHaveURL(/\/account\/orders\//, { timeout: 15_000 });

  // The invoice is a real page (printable), not a toast.
  const orderUrl = page.url();
  await page.getByRole('link', { name: /تحميل الفاتورة/ }).click();
  await expect(page).toHaveURL(/\/invoice$/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'فاتورة' })).toBeVisible();
  await expect(page.getByText('زيت عباد الشمس كريستال').first()).toBeVisible();
  await page.goto(orderUrl);

  // Cancel → confirm in the dialog → status flips to «ملغي» …
  await page.getByRole('button', { name: /إلغاء الطلب/ }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: /إلغاء الطلب/ }).click();
  await expect(page.getByText('ملغي').first()).toBeVisible({ timeout: 15_000 });

  // … and it is STILL cancelled after a reload, because the server did it.
  await page.reload();
  await expect(page.getByText('ملغي').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /إلغاء الطلب/ })).toHaveCount(0);

  // Both transitions were also recorded as in-app notifications by the server (not a
  // client toast), and the cancellation notice deep-links back to the order.
  await page.goto('/account/notifications');
  await expect(page.getByText('تم استلام طلبك').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('تم إلغاء طلبك').first()).toBeVisible();
  await page.getByRole('link', { name: /تم إلغاء طلبك/ }).first().click();
  await expect(page).toHaveURL(orderUrl, { timeout: 15_000 });
});

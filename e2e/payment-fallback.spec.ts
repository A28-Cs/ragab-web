import { test, expect } from '@playwright/test';
import { registerFreshCustomer, addOilAndStartCheckout } from './helpers';

/**
 * P0-8 regression: the success page shows the payment leg exactly as the SERVER reports
 * it (no client-side "success"), keeps it across a reload (the step is replayed from the
 * server, not from sessionStorage), and an unpaid transfer order can fall back to cash on
 * delivery — a real server-side change that survives a reload.
 */
test('an unpaid transfer order shows its instructions, survives a reload, and can switch to cash on delivery', async ({ page }) => {
  test.setTimeout(120_000);
  await registerFreshCustomer(page, 'مختبر الدفع');
  await addOilAndStartCheckout(page);

  // Pick Vodafone Cash (Paymob is not configured locally → manual transfer instructions).
  await page.getByText('فودافون كاش').first().click();
  await page.getByRole('button', { name: /مراجعة الطلب/ }).click();
  await page.getByRole('button', { name: /تأكيد وإرسال الطلب/ }).click();
  await expect(page).toHaveURL(/\/order-success\?orderId=/, { timeout: 30_000 });

  // Scoped to <main>: in dev Next keeps the searchParams-less SSR shell of this page around too.
  const card = page.locator('main [data-phase]');
  await expect(card).toHaveAttribute('data-phase', 'transfer', { timeout: 15_000 });
  await expect(page.getByText(/فودافون كاش/).first()).toBeVisible();

  // Reload: sessionStorage is gone, the step comes back from GET /orders/:id/payment.
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(card).toHaveAttribute('data-phase', 'transfer', { timeout: 15_000 });

  // Fall back to cash on delivery → the server switches the order; the page reflects it …
  await page.getByRole('button', { name: /التحويل إلى الدفع عند الاستلام/ }).click();
  await expect(card).toHaveAttribute('data-phase', 'cod', { timeout: 15_000 });
  await expect(page.getByText(/ادفع نقدًا لمندوب التوصيل/)).toBeVisible();

  // … and still after a reload, because it is the order's real payment method now.
  await page.reload();
  await expect(card).toHaveAttribute('data-phase', 'cod', { timeout: 15_000 });
  await expect(page.getByRole('button', { name: /التحويل إلى الدفع عند الاستلام/ })).toHaveCount(0);
});

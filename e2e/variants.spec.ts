import { test, expect, type Page } from '@playwright/test';

/**
 * 0007 regression: a product sold in more than one unit (piece / tray). The PDP lets the
 * shopper pick the tray, and the cart line then carries the TRAY's name and price — the
 * server priced it per variant, the client only rendered the answer.
 *
 * Setup calls run inside the page (same fetch, same CSRF double-submit as the app).
 */
async function apiFromPage<T>(page: Page, method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const csrf = document.cookie.split('; ').find((c) => c.startsWith('ragab_csrf='))?.split('=')[1] ?? '';
      const res = await fetch(`/api/v1${path}`, {
        method,
        headers: { 'content-type': 'application/json', 'x-csrf-token': decodeURIComponent(csrf) },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'same-origin',
      });
      const json = await res.json().catch(() => ({}));
      return { status: res.status, data: json.data };
    },
    { method, path, body },
  );
}

test('a two-unit product: the PDP picks the tray and the cart line shows the tray price', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');

  // The owner creates the product through the same API the control center uses.
  const login = await apiFromPage(page, 'POST', '/auth/login', { identifier: '01000000000', password: 'Admin@12345' });
  expect(login.status).toBe(200);
  const stamp = Date.now().toString(36).toUpperCase();
  const created = await apiFromPage<{ id: string; slug: string }>(page, 'POST', '/products', {
    sku: `E2E-EGG-${stamp}`, nameAr: 'بيض اختبار', nameEn: `E2E Eggs ${stamp}`, categoryId: 'cat_dairy', unitAr: 'حبة', unitEn: 'piece', price: 5,
    variants: [
      { sku: `E2E-EGG-${stamp}-1`, nameAr: 'حبة', nameEn: 'Piece', price: 5, stockQuantity: 30, isDefault: true },
      { sku: `E2E-EGG-${stamp}-12`, nameAr: 'كرتونة 12', nameEn: 'Tray of 12', price: 55, stockQuantity: 2 },
    ],
  });
  expect(created.status).toBe(201);
  const product = created.data;

  try {
    await page.goto(`/product/${product.slug}`);
    const tray = page.getByRole('radio', { name: /كرتونة 12/ });
    await expect(tray).toBeVisible();
    await tray.click();
    await expect(tray).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: /أضف إلى السلة/ }).first().click();

    await page.goto('/cart');
    await expect(page.getByText('كرتونة 12').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/55\.00/).first()).toBeVisible();
    await expect(page.getByText('بيض اختبار').first()).toBeVisible();
  } finally {
    await apiFromPage(page, 'DELETE', '/cart');
    await apiFromPage(page, 'DELETE', `/products/${product.id}`);
  }
});

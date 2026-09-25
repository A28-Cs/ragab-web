import { test, expect, type Page } from '@playwright/test';

// Deterministic UI coverage; no production credentials or mutations.
async function fixture(page: Page, signedIn = false, admin = false) {
  const product = { id: 'p1', slug: 'care', nameAr: 'منتج عناية', nameEn: 'Daily care', categoryId: 'c1', categoryNameAr: 'العناية', unitAr: 'عبوة', unitEn: 'pack', price: 125, inStock: true, stockQuantity: 10, image: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="160"><rect x="30" y="15" width="60" height="135" rx="8" fill="#c9e8df"/><path d="M50 65h20m-10-10v20" stroke="#087d70" stroke-width="7"/></svg>'), descriptionAr: '' };
  const products = [1,2,3].map(id => ({ ...product, id: 'p' + id, slug: 'care-' + id }));
  const permissions = admin ? ['products:view', 'products:edit', 'orders:view', 'reports:view', 'customers:view', 'inventory:view', 'audit:view'] : [];
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path.startsWith('/events/')) return route.fulfill({ contentType: 'text/event-stream', body: ': test\n\n' });
    let data: unknown = [];
    if (path === '/auth/logout') { signedIn = false; data = {}; }
    else if (path === '/auth/me') data = { user: signedIn ? { id: 'u1', name: 'مستخدم الاختبار', phone: '01000000000', roleId: admin ? 'role_owner' : null } : null, permissions };
    else if (path === '/categories') data = [{ id: 'c1', slug: 'skin-care', nameAr: 'العناية بالبشرة', nameEn: 'Skin care', iconName: 'heart', itemCount: 3 }];
    else if (['/products/offers', '/products/popular', '/products/essential'].includes(path)) data = products;
    else if (path === '/products' || path === '/admin/products') data = { items: products, hasMore: false, total: 3 };
    else if (path === '/cart') data = { items: [], totalItems: 0, subtotal: 0, deliveryFee: 0, discount: 0, tax: 0, total: 0, freeDeliveryThreshold: 300, freeDeliveryProgress: 0, currency: 'EGP' };
    else if (path === '/admin/dashboard') data = { todayOrders: 0, revenue: 75, customers: 17, lowStock: 3, timeZone: 'Africa/Cairo', asOf: new Date().toISOString() };
    else if (path === '/admin/orders') data = { items: [], hasMore: false, total: 0 };
    else if (path.includes('audit')) data = { items: [], hasMore: false };
    await route.fulfill({ json: { success: true, data } });
  });
}

for (const width of [320, 390, 768, 1024, 1440]) {
  test('guest storefront fits at ' + width, async ({ page }) => {
    await fixture(page);
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/');
    await expect(page.locator('#home-hero')).toBeVisible();
    await expect(page.locator('header a[href="/login"]:visible')).toHaveAccessibleName(/تسجيل الدخول/);
    expect(await page.locator('header').evaluate(el => el.getBoundingClientRect().top)).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect.poll(() => page.evaluate(() => Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) - document.querySelector('header')!.getBoundingClientRect().height))).toBeLessThan(1);
    await expect(page.locator('section[aria-labelledby="home-hero"] a[href="/product/care-1"]')).toBeVisible();
    await page.screenshot({ path: 'test-results/storefront-' + width + '.png', fullPage: false });
    expect(errors).toEqual([]);
  });
}

test('customer has visible account and drawer logout', async ({ page }) => {
  await fixture(page, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('header button[aria-haspopup="menu"]:visible').click();
  await expect(page.getByRole('menuitem', { name: 'تسجيل الخروج' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('header button[aria-label="القائمة"]').click();
  const logout = page.getByRole('dialog').getByRole('button', { name: 'تسجيل الخروج' });
  await expect(logout).toBeVisible();
  await logout.click();
  await expect(page.locator('header a[href="/login"]:visible')).toBeVisible();
});

test('menu flips at bottom, stays visible on resize, and restores focus', async ({ page }) => {
  await fixture(page, true);
  await page.goto('/');
  const trigger = page.locator('header button[aria-haspopup="menu"]:visible');
  await trigger.evaluate(el => { el.style.position = 'fixed'; el.style.bottom = '8px'; el.style.left = '8px'; });
  await trigger.click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox(); const button = await trigger.boundingBox();
  expect(box!.y + box!.height).toBeLessThan(button!.y);
  await page.setViewportSize({ width: 1024, height: 200 });
  await expect.poll(async () => { const b = await menu.boundingBox(); return !!b && b.x >= 0 && b.y >= 0 && b.x + b.width <= 1024 && b.y + b.height <= 200; }).toBe(true);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await menu.evaluate(el => { el.scrollTop = 50; });
  await expect(menu).toBeVisible();
  await page.locator('#home-hero').dispatchEvent('mousedown');
  await expect(menu).toBeHidden();
});

test('dashboard renders API zero and net revenue, then exposes failure', async ({ page }) => {
  await fixture(page, true, true);
  await page.goto('/control-center');
  await expect(page.getByText('٠', { exact: true })).toBeVisible();
  await expect(page.getByText('٧٥ ج.م', { exact: true })).toBeVisible();
  await page.route('**/api/v1/admin/dashboard', route => route.fulfill({ status: 500, json: { success: false, error: { code: 'FAIL', message: { ar: 'خطأ', en: 'Failed' } } } }));
  await page.getByRole('button', { name: 'تحديث', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'تعذر تحميل الإحصاءات' })).toBeVisible();
});

test('dashboard shows loading until the response arrives and survives direct refresh', async ({ page }) => {
  await fixture(page, true, true);
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/admin/dashboard', async route => {
    await pending;
    await route.fulfill({ json: { success: true, data: { todayOrders: 0, revenue: 0, customers: 0, lowStock: 0, timeZone: 'Africa/Cairo', asOf: new Date().toISOString() } } });
  });
  await page.goto('/control-center');
  await expect(page.locator('[aria-busy="true"]')).toBeVisible();
  release();
  await expect(page.locator('[aria-busy="false"]')).toBeVisible();
  await page.reload();
  await expect(page.getByText('٠ ج.م', { exact: true })).toBeVisible();
});

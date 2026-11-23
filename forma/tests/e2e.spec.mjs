import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/forma/');
  await expect(page.locator('#main')).toBeVisible();
});

test('initial layout and both schedules', async ({ page }) => {
  await expect(page.locator('[data-action="choose"]')).toHaveCount(3);
  await expect(page.locator('#main')).toContainText('Обратные выпады');
  await page.locator('[data-action="schedule"][data-val="one"]').click();
  await expect(page.locator('#main')).toContainText('1 раз DDX');
  await expect(page.locator('[data-action="choose"]')).toHaveCount(3);
  await expect(page.locator('#main')).toContainText('A + D + E');
  await page.reload();
  await expect(page.locator('[data-action="schedule"][data-val="one"]')).toHaveClass(/primary/);
});

test('complete workout and restore state after reload', async ({ page }) => {
  await page.locator('[data-action="start"]').click();
  await expect(page.locator('#main')).toContainText('ТРЕНИРОВКА A');
  await page.locator('#set-weight').fill('12.5');
  await page.locator('[data-action="log"]').first().click();
  await page.reload();
  await expect(page.locator('#main')).toContainText('ТРЕНИРОВКА A');
  await page.locator('details').filter({ has: page.locator('[data-action="finish"]') }).locator('summary').click();
  await page.locator('[data-action="finish"]').first().click();
  await page.locator('[data-action="tab"][data-val="history"]').click();
  await expect(page.locator('#main')).toContainText('Тренировка A');
  await page.locator('[data-action="tab"][data-val="progress"]').click();
  await expect(page.locator('#main')).toContainText('Мой прогресс');
});

test('iPhone SE viewport has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.locator('[data-action="start"]').click();
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test('service worker can register over localhost', async ({ page }) => {
  await expect.poll(async () => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration('./')))).toBeTruthy();
});

test('offline PWA reload preserves active workout and logged set', async ({ page, context }) => {
  await expect.poll(async () => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBeTruthy();
  await page.locator('[data-action="start"]').click();
  await page.locator('#set-weight').fill('7.5');
  await page.locator('[data-action="log"]').click();
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#main')).toContainText('ТРЕНИРОВКА A');
    await expect(page.locator('#main')).toContainText('Всего 1/');
    await page.locator('[data-action="tab"][data-val="history"]').click();
    await page.locator('[data-action="tab"][data-val="today"]').click();
    await expect(page.locator('#main')).toContainText('ТРЕНИРОВКА A');
  } finally {
    await context.setOffline(false);
  }
});

test('service worker update keeps locally saved schedule', async ({ page }) => {
  await expect.poll(async () => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBeTruthy();
  await page.locator('[data-action="schedule"][data-val="one"]').click();
  const before = await page.evaluate(() => navigator.serviceWorker.controller.scriptURL);
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration('./');
    if (!registration) throw new Error('Missing service worker registration');
    await registration.update();
  });
  await page.reload();
  await expect(page.locator('[data-action="schedule"][data-val="one"]')).toHaveClass(/primary/);
  const after = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL);
  expect(after).toBe(before);
});

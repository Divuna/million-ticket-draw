import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? '';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? '';

test.describe('Voucher Purchase', () => {
  test.beforeEach(async ({ page }) => {
    if (!TEST_EMAIL || !TEST_PASSWORD) {
      test.skip(true, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set – skipping voucher tests');
    }
    await loginViaUI(page, TEST_EMAIL, TEST_PASSWORD);
  });

  test('vouchers page loads with three tab headings', async ({ page }) => {
    await page.goto('/vouchers');

    await expect(page.getByRole('heading', { name: 'Vouchery' })).toBeVisible({ timeout: 10_000 });

    // All three tabs must be present
    await expect(page.getByRole('tab', { name: /Dostupné|Dost\./i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Oblíbené|Obl\./i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Zakoupené|Zak\./i })).toBeVisible();
  });

  test('voucher buy button visible or empty-state shown', async ({ page }) => {
    await page.goto('/vouchers');

    // Wait for async data to load (skeleton replaced by real content)
    await page.waitForTimeout(3_000);

    const buyButton = page.getByRole('button', { name: /KOUPIT ZA 5 MC/i }).first();
    const emptyState = page.getByText(/Žádné dostupné vouchery|Momentálně nejsou/i);

    const buyVisible = await buyButton.isVisible();
    const emptyVisible = await emptyState.isVisible();

    // One of these two states must be true – the page must not be blank
    expect(buyVisible || emptyVisible).toBeTruthy();
  });

  test('clicking buy button produces success or error feedback', async ({ page }) => {
    await page.goto('/vouchers');
    await page.waitForTimeout(3_000);

    const buyButton = page.getByRole('button', { name: /KOUPIT ZA 5 MC/i }).first();

    if (!(await buyButton.isVisible())) {
      test.skip(true, 'No available vouchers in DB – skipping purchase attempt');
    }

    await buyButton.click();

    // Sonner toasts render as li[data-sonner-toast] or with role=status
    const toast = page
      .locator('[data-sonner-toast]')
      .or(page.locator('[role="status"]'))
      .or(page.locator('[role="alert"]'));

    await expect(toast.first()).toBeVisible({ timeout: 10_000 });
  });
});

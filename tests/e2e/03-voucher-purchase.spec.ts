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

  test('voucher detail button visible on available card', async ({ page }) => {
    await page.goto('/vouchers');

    await expect(page.getByRole('heading', { name: 'Vouchery' })).toBeVisible({ timeout: 10_000 });

    // New voucher UI is full-banner first. Purchase is no longer rendered on the card;
    // the card exposes Detail and the purchase CTA is inside the detail modal.
    const spec03Card = page
      .locator('.voucher-card-glow')
      .filter({ has: page.locator('img[alt*="E2E Spec03 Voucher"]') })
      .first();
    await expect(spec03Card, 'Seeded E2E Spec03 full-banner card must be visible').toBeVisible({ timeout: 15_000 });

    const detailButton = spec03Card.getByRole('button', { name: /Detail/i });
    await expect(detailButton).toBeVisible({ timeout: 15_000 });
  });

  test('clicking detail purchase button produces success or error feedback', async ({ page }) => {
    await page.goto('/vouchers');
    await expect(page.getByRole('heading', { name: 'Vouchery' })).toBeVisible({ timeout: 10_000 });

    const spec03Card = page
      .locator('.voucher-card-glow')
      .filter({ has: page.locator('img[alt*="E2E Spec03 Voucher"]') })
      .first();
    await expect(spec03Card, 'Seeded E2E Spec03 full-banner card must be visible').toBeVisible({ timeout: 15_000 });

    const detailButton = spec03Card.getByRole('button', { name: /Detail/i });
    await expect(detailButton).toBeVisible({ timeout: 15_000 });
    await detailButton.click();

    const dialog = page.getByRole('dialog', { name: 'E2E Spec03 Voucher' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const buyButton = dialog.getByRole('button', { name: /Koupit za\s+5\s+MioCoin/i });
    await expect(buyButton).toBeVisible({ timeout: 10_000 });
    await buyButton.click();

    // Sonner toasts render as li[data-sonner-toast] or with role=status/alert.
    const toast = page
      .locator('[data-sonner-toast]')
      .or(page.locator('[role="status"]'))
      .or(page.locator('[role="alert"]'));

    await expect(toast.first()).toBeVisible({ timeout: 10_000 });
  });
});

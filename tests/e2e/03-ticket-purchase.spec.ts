import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? '';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? '';

test.describe('Ticket Purchase', () => {
  test('can navigate to a contest and attempt ticket purchase', async ({ page }) => {
    if (!TEST_EMAIL || !TEST_PASSWORD) {
      test.skip(true, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set – skipping ticket purchase test');
    }

    await loginViaUI(page, TEST_EMAIL, TEST_PASSWORD);

    await page.goto('/games');

    // Wait for contest cards to load and click the first Detail button
    const detailBtn = page.getByRole('button', { name: 'Detail' }).first();
    await expect(detailBtn).toBeVisible({ timeout: 10_000 });
    await detailBtn.click();

    // Should navigate to /contest/:id
    await page.waitForURL(/\/contest\//, { timeout: 10_000 });

    // Two valid states: enough balance → buy button; insufficient → top-up button
    const buyButton = page.getByRole('button', { name: /Uplatnit.*MioCoin/i });
    const topUpButton = page.getByRole('button', { name: /Dobít MioCoiny/i });

    await expect(buyButton.or(topUpButton).first()).toBeVisible({ timeout: 15_000 });

    if (await buyButton.isVisible()) {
      await buyButton.click();

      // Any of these confirms the purchase was processed
      const feedback = page
        .locator('[data-sonner-toast]')
        .or(page.locator('[role="dialog"]'))
        .or(page.locator('[role="alert"]'))
        .or(page.locator('[role="status"]'));

      await expect(feedback.first()).toBeVisible({ timeout: 20_000 });
    } else {
      // Insufficient balance is a valid smoke-pass — page rendered correctly
      await expect(topUpButton).toBeEnabled();
    }
  });
});

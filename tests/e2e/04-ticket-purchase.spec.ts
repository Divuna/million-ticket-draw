import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? '';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? '';
// Optional: set to a known active contest UUID to skip games-page discovery
const TEST_CONTEST_ID = process.env.E2E_CONTEST_ID ?? '';

test.describe('Contest Ticket Purchase', () => {
  test.beforeEach(async ({ page }) => {
    if (!TEST_EMAIL || !TEST_PASSWORD) {
      test.skip(true, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set – skipping ticket tests');
    }
    await loginViaUI(page, TEST_EMAIL, TEST_PASSWORD);
  });

  test('games page loads without errors', async ({ page }) => {
    await page.goto('/games');

    await expect(page).toHaveURL('/games', { timeout: 10_000 });
    await expect(page.getByText('Soutěž nenalezena')).not.toBeVisible();
  });

  test('navigating to a contest detail shows the ticket purchase section', async ({ page }) => {
    let contestPath: string;

    if (TEST_CONTEST_ID) {
      contestPath = `/contest/${TEST_CONTEST_ID}`;
    } else {
      await page.goto('/games');
      await page.waitForTimeout(3_000);

      // ContestCard renders a "Detail" button that navigates to /contest/:id
      const detailBtn = page.getByRole('button', { name: 'Detail' }).first();

      if (!(await detailBtn.isVisible())) {
        test.skip(true, 'No active contest cards found on /games – skipping');
      }

      await detailBtn.click();
      await page.waitForURL(/\/contest\//, { timeout: 10_000 });
      contestPath = new URL(page.url()).pathname;
    }

    await page.goto(contestPath);

    // Either the "Uplatnit" buy button or the top-up redirect button must appear
    const buyButton = page.getByRole('button', { name: /Uplatnit.*MioCoin/i });
    const topUpButton = page.getByRole('button', { name: /Dobít MioCoiny/i });

    await expect(buyButton.or(topUpButton).first()).toBeVisible({ timeout: 15_000 });
  });

  test('clicking ticket purchase button produces result modal or feedback', async ({ page }) => {
    if (!TEST_CONTEST_ID) {
      test.skip(true, 'E2E_CONTEST_ID not set – skipping direct ticket purchase test');
    }

    await page.goto(`/contest/${TEST_CONTEST_ID}`);

    const buyButton = page.getByRole('button', { name: /Uplatnit.*MioCoin/i });
    const topUpButton = page.getByRole('button', { name: /Dobít MioCoiny/i });

    await expect(buyButton.or(topUpButton).first()).toBeVisible({ timeout: 15_000 });

    if (await buyButton.isVisible()) {
      await buyButton.click();

      // Expect either the ticket result modal (dialog) or a Sonner toast
      const feedback = page
        .locator('[role="dialog"]')
        .or(page.locator('[data-sonner-toast]'))
        .or(page.locator('[role="alert"]'))
        .or(page.locator('[role="status"]'));

      await expect(feedback.first()).toBeVisible({ timeout: 20_000 });
    } else {
      // Insufficient funds branch is also a valid smoke-pass
      await expect(topUpButton).toBeEnabled();
    }
  });
});

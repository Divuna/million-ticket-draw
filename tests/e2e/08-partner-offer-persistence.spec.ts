import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? '';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? '';

test.describe('Partner Offer Persistence', () => {
  test('opened offer persists after page reload and loses Nová badge', async ({ page }) => {
    if (!TEST_EMAIL || !TEST_PASSWORD) {
      test.skip(true, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set – skipping persistence test');
    }

    await loginViaUI(page, TEST_EMAIL, TEST_PASSWORD);
    await page.goto('/wins');
    await page.getByRole('button', { name: /Nabídky/ }).click();
    await page.waitForTimeout(2_000);

    // Skip if no offers available
    const emptyState = page.getByText('Zatím nemáte žádné nabídky');
    if (await emptyState.isVisible()) {
      test.skip(true, 'No partner offers in DB for this account – skipping');
    }

    const firstCard = page.locator('div.group.cursor-pointer').first();
    await expect(firstCard).toBeVisible({ timeout: 5_000 });

    // Open the offer so opened_at is written to DB
    await firstCard.click();
    // Scoped to OfferDetailModal — the only dialog with a "Skrýt nabídku" button
    const dialog = page.locator('[role="dialog"]:has(button:has-text("Skrýt nabídku"))');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Wait for opened_at PATCH to complete before reloading
    await page.waitForResponse(
      (res) =>
        res.url().includes('user_partner_offers') &&
        res.request().method() === 'PATCH',
      { timeout: 5_000 },
    ).catch(() => { /* offer may already have been opened previously */ });

    // Close modal via Escape and reload
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 3_000 });

    await page.reload();

    // Switch back to Nabídky tab after reload
    await page.getByRole('button', { name: /Nabídky/ }).click();
    await page.waitForTimeout(2_000);

    // 1) Offer must still be present after reload
    const firstCardAfterReload = page.locator('div.group.cursor-pointer').first();
    await expect(
      firstCardAfterReload,
      'Offer should still be visible after reload',
    ).toBeVisible({ timeout: 5_000 });

    // 2) "Nová" badge must be gone — opened_at was persisted to DB
    const novaLabel = firstCardAfterReload.getByText('Nová');
    await expect(
      novaLabel,
      'Nová badge should not appear after offer has been opened',
    ).not.toBeVisible({ timeout: 3_000 });
  });
});

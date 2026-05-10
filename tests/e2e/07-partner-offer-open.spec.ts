import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? '';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? '';

test.describe('Partner Offer Open', () => {
  test('user can open partner offer detail from Nabídky tab', async ({ page }) => {
    if (!TEST_EMAIL || !TEST_PASSWORD) {
      test.skip(true, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set – skipping partner offer open test');
    }

    await loginViaUI(page, TEST_EMAIL, TEST_PASSWORD);
    await page.goto('/wins');

    // Switch to Nabídky tab (button contains icon + text "Nabídky" + optional count badge)
    await page.getByRole('button', { name: /Nabídky/ }).click();

    // Wait for tab content: either an offer card or the empty-state text must
    // appear before we decide whether to skip or proceed.
    const emptyState = page.getByText('Zatím nemáte žádné nabídky');
    // OfferCard renders as <div class="group ... cursor-pointer ...">
    const firstCard = page.locator('div.group.cursor-pointer').first();

    // Race between the two possible outcomes — whichever resolves first wins.
    await Promise.race([
      firstCard.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {}),
      emptyState.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {}),
    ]);

    // Skip if no offers exist for this account
    if (await emptyState.isVisible()) {
      test.skip(true, 'No partner offers in DB for this account – skipping');
    }
    if (!await firstCard.isVisible()) {
      test.skip(true, 'No offer cards visible in Nabídky tab – skipping');
    }

    // Record whether the offer was unread before opening
    const novaLabel = firstCard.getByText('Nová');
    const wasNew = await novaLabel.isVisible();

    // Intercept the opened_at PATCH so we can confirm the DB write fired
    let openedAtWritten = false;
    page.on('response', (res) => {
      if (
        res.url().includes('user_partner_offers') &&
        res.request().method() === 'PATCH'
      ) {
        openedAtWritten = true;
      }
    });

    await firstCard.click();

    // 1) Offer detail modal must be visible — scoped to the dialog containing
    //    the "Skrýt nabídku" button, which is unique to OfferDetailModal
    const dialog = page.locator('[role="dialog"]:has(button:has-text("Skrýt nabídku"))');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // 2) Modal must contain a heading (DialogTitle = offer title)
    await expect(dialog.getByRole('heading').first()).toBeVisible({ timeout: 3_000 });

    // 3) opened_at PATCH must have fired — only when offer was new
    if (wasNew) {
      await page.waitForTimeout(1_000); // let useEffect fire
      expect(openedAtWritten, 'Expected opened_at PATCH to user_partner_offers').toBe(true);
    }
  });
});

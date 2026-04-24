import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? '';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? '';

test.describe('Partner Offer Assignment', () => {
  test('non-winning ticket purchase shows partner offer in result modal', async ({ page }) => {
    if (!TEST_EMAIL || !TEST_PASSWORD) {
      test.skip(
        true,
        'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set – skipping partner offer test',
      );
    }

    await loginViaUI(page, TEST_EMAIL, TEST_PASSWORD);
    await page.goto('/games');

    // Open first available contest
    const detailBtn = page.getByRole('button', { name: 'Detail' }).first();
    await expect(detailBtn).toBeVisible({ timeout: 10_000 });
    await detailBtn.click();
    await page.waitForURL(/\/contest\//, { timeout: 10_000 });

    const buyButton = page.getByRole('button', { name: /Uplatnit.*MioCoin/i });
    await expect(buyButton).toBeVisible({ timeout: 15_000 });

    // Capture won_type and partner_offer presence from the RPC response
    let wonType: string | null = null;
    let hasPartnerOffer = false;
    page.on('response', async (res) => {
      if (res.url().includes('/rest/v1/rpc/buy_ticket_atomic')) {
        try {
          const body = await res.json();
          const result = Array.isArray(body) ? body[0] : body;
          wonType = result?.won_type ?? null;
        } catch { /* ignore */ }
      }
      if (res.url().includes('user_partner_offers')) {
        try {
          const body = await res.json();
          const rows = Array.isArray(body) ? body : [body];
          hasPartnerOffer = rows.length > 0 && !!rows[0];
        } catch { /* ignore */ }
      }
    });

    await buyButton.click();

    // Result modal always opens after purchase
    const resultDialog = page.locator('[role="dialog"]');
    await expect(resultDialog).toBeVisible({ timeout: 20_000 });

    // Only assert partner offer UI when won_type is null (non-winning ticket)
    if (wonType === null) {
      // TicketResultModal renders 'SPECIÁLNÍ NABÍDKA!' heading for partner offer
      const offerHeading = page.getByText('SPECIÁLNÍ NABÍDKA', { exact: false });
      // Fallback: the saved-offer hint is always present when offer is assigned
      const offerHint = page.getByText('Nabídka je uložena v tvých', { exact: false });

      await expect(
        offerHeading.or(offerHint),
        'Expected partner offer indicator in result modal for non-winning ticket',
      ).toBeVisible({ timeout: 5_000 });
    } else {
      // Won a prize — partner offer assertion is skipped for this run
      test.info().annotations.push({
        type: 'skip-reason',
        description: `won_type was '${wonType}' — partner offer branch not exercised`,
      });
    }
  });
});

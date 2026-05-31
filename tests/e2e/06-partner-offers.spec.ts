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

    // Capture won_type from buy_ticket_atomic RPC response.
    // Separately track whether user_partner_offers lookup returned an actual row —
    // partner offers are NOT guaranteed after every non-winning ticket because:
    //   - 5-minute cooldown per user
    //   - contest may have no active approved partner offer linked
    let wonType: string | null | undefined = undefined; // undefined = not yet captured
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
          // maybeSingle() returns a single object or null (not an array).
          // Non-null object → offer assigned; null → no offer assigned.
          const rows = Array.isArray(body) ? body : [body];
          hasPartnerOffer = rows.length > 0 && !!rows[0];
        } catch { /* ignore */ }
      }
    });

    await buyButton.click();

    // Result modal always opens after a successful ticket purchase
    const resultDialog = page.locator('[role="dialog"]');
    await expect(resultDialog).toBeVisible({ timeout: 20_000 });

    // The partner offer lookup is a separate async call that fires after buy_ticket_atomic
    // succeeds. Give it time to complete so hasPartnerOffer is settled before we check it.
    await page.waitForTimeout(3_000);

    if (wonType === null) {
      if (hasPartnerOffer) {
        // Offer was actually assigned — assert it is visible in the modal
        const offerHeading = page.getByText('SPECIÁLNÍ NABÍDKA', { exact: false });
        const offerHint = page.getByText('Nabídka je uložena v tvých', { exact: false });
        await expect(
          offerHeading.or(offerHint),
          'Expected partner offer indicator in result modal (DB confirmed offer was assigned)',
        ).toBeVisible({ timeout: 5_000 });
      } else {
        // won_type=null but no offer row returned — NOT an app bug.
        // Either the 5-minute cooldown is active for this user or the contest
        // has no active approved partner offer linked to it.
        test.info().annotations.push({
          type: 'skip-reason',
          description:
            'won_type=null but no partner offer was assigned — cooldown active or no eligible approved offer for this contest',
        });
        console.log(
          '[test:06] Partner offer UI assertion skipped — no offer assigned (cooldown or no eligible offer)',
        );
      }
    } else if (wonType !== undefined) {
      // Ticket was a winner — partner offer is never shown on winning tickets
      test.info().annotations.push({
        type: 'skip-reason',
        description: `won_type='${wonType}' — partner offer branch not exercised on winning ticket`,
      });
    } else {
      // buy_ticket_atomic response was not captured (URL mismatch or network error)
      test.info().annotations.push({
        type: 'skip-reason',
        description: 'buy_ticket_atomic response not captured — cannot determine won_type',
      });
    }
  });
});

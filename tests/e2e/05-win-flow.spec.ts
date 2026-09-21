import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? '';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? '';
// Must point to a contest seeded with exactly 1 remaining ticket
const WIN_CONTEST_ID = process.env.E2E_WIN_CONTEST_ID ?? '';

// retries: 0 — buying the last ticket closes the contest; a retry would find
// it closed and fail. One attempt is the correct contract for this test.
test.describe.configure({ retries: 0 });

test.describe('Win Flow', () => {
  test('buying last ticket shows win result', async ({ page }) => {
    if (!TEST_EMAIL || !TEST_PASSWORD || !WIN_CONTEST_ID) {
      test.skip(
        true,
        'E2E_TEST_EMAIL, E2E_TEST_PASSWORD and E2E_WIN_CONTEST_ID must all be set',
      );
    }

    await loginViaUI(page, TEST_EMAIL, TEST_PASSWORD);
    await page.goto(`/contest/${WIN_CONTEST_ID}`);

    const buyButton = page.getByRole('button', { name: /Uplatnit.*MioCoin/i });
    await expect(buyButton).toBeVisible({ timeout: 15_000 });

    // Every customer purchase now goes exclusively through
    // purchase_guaranteed_benefit_bundle_atomic — the classic bare
    // buy_ticket_atomic RPC is no longer reachable from any customer page.
    // Capture won_type from that RPC response before asserting UI.
    let wonType: string | null = null;
    page.on('response', async (res) => {
      if (res.url().includes('/rest/v1/rpc/purchase_guaranteed_benefit_bundle_atomic')) {
        try {
          const body = await res.json();
          const result = Array.isArray(body) ? body[0] : body;
          wonType = result?.won_type ?? null;
        } catch { /* ignore parse errors */ }
      }
    });

    await buyButton.click();

    // The mystery/benefit result dialog is always shown — confirm it opened.
    // Scoped by accessible name to avoid strict-mode conflict with the
    // CookieConsentBanner which also renders role="dialog". Accessible name
    // comes from MysteryPurchaseResultDialog's sr-only DialogTitle, which for
    // a winner is `Vyhrál jsi: ${prizeTitle}`.
    const resultDialog = page.getByRole('dialog', { name: /Vyhrál/i });
    await expect(resultDialog).toBeVisible({ timeout: 20_000 });

    // Win celebration is rendered inline inside the dialog (no separate
    // sonner toast for a win in the mystery/benefit flow).
    await expect(resultDialog.getByText(/GRATULUJEME/i)).toBeVisible({ timeout: 5_000 });

    // won_type captured from API must be main or bonus
    expect(['main', 'bonus']).toContain(wonType);
  });
});

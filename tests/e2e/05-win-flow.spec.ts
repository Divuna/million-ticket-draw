import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? '';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? '';
// Must point to a contest seeded with exactly 1 remaining ticket
const WIN_CONTEST_ID = process.env.E2E_WIN_CONTEST_ID ?? '';

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

    // Capture won_type from the RPC response before asserting UI
    let wonType: string | null = null;
    page.on('response', async (res) => {
      if (res.url().includes('/rest/v1/rpc/buy_ticket_atomic')) {
        try {
          const body = await res.json();
          const result = Array.isArray(body) ? body[0] : body;
          wonType = result?.won_type ?? null;
        } catch { /* ignore parse errors */ }
      }
    });

    await buyButton.click();

    // Win toast is shown only on main or bonus win
    const winToast = page.getByText(/Gratulujeme/i);
    await expect(winToast).toBeVisible({ timeout: 20_000 });

    // The result modal is always shown — confirm it opened
    const resultDialog = page.locator('[role="dialog"]');
    await expect(resultDialog).toBeVisible({ timeout: 5_000 });

    // won_type captured from API must be main or bonus
    expect(['main', 'bonus']).toContain(wonType);
  });
});

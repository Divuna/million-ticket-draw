/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  STAGING ONLY — Wallet Balance Decrease After Voucher Purchase             ║
 * ║                                                                            ║
 * ║  This test MUTATES staging data (deducts MioCoins via voucher purchase).  ║
 * ║  It MUST NOT run against production.                                       ║
 * ║                                                                            ║
 * ║  Production smoke hard-codes only 01 + 02 spec files — this file          ║
 * ║  will never be picked up by production smoke.                              ║
 * ║                                                                            ║
 * ║  Staging Full E2E runs `playwright test` (all files) but:                 ║
 * ║    - E2E_CONTEST_ID is set only via STAGING_E2E_CONTEST_ID secret         ║
 * ║    - Wallet is reset to 5 000 MC before each run                          ║
 * ║    - user_vouchers for the test user are deleted before each run          ║
 * ║    - A dedicated "E2E Spec10 Voucher" is seeded before each run           ║
 * ║    - Environment is confirmed staging by STAGING_VITE_SUPABASE_URL        ║
 * ║                                                                            ║
 * ║  Guard: test.skip when E2E_CONTEST_ID is absent (production CI has it     ║
 * ║  empty), so it is doubly protected against accidental production run.      ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth';

const TEST_EMAIL     = process.env.E2E_TEST_EMAIL    ?? '';
const TEST_PASSWORD  = process.env.E2E_TEST_PASSWORD ?? '';
const TEST_CONTEST_ID = process.env.E2E_CONTEST_ID ?? '';

function parseCzechInt(raw: string): number {
  const digits = raw.replace(/[\s   ]+/g, '');
  const n = parseInt(digits, 10);
  if (Number.isNaN(n)) {
    throw new Error(`parseCzechInt: could not parse "${raw}" (after strip: "${digits}")`);
  }
  return n;
}

test.describe('Voucher Purchase — Wallet Balance Decrease', () => {
  test('balance decreases by voucher price after a single voucher purchase', async ({ page }) => {
    test.setTimeout(60_000);

    if (!TEST_EMAIL || !TEST_PASSWORD) {
      test.skip(true, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set — skipping');
    }
    if (!TEST_CONTEST_ID) {
      test.skip(
        true,
        'E2E_CONTEST_ID not set — staging-only test; production CI intentionally leaves this empty',
      );
    }

    await loginViaUI(page, TEST_EMAIL, TEST_PASSWORD);

    const beforeWalletResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/rest/v1/wallets') &&
        res.request().method() === 'GET',
      { timeout: 15_000 },
    );
    await page.goto(`/contest/${TEST_CONTEST_ID}`);
    await beforeWalletResponse;

    const balanceLabel = page.getByText('Tvůj stav MioCoinů', { exact: true });
    await expect(balanceLabel).toBeVisible({ timeout: 10_000 });

    const balanceParagraph = balanceLabel.locator('xpath=following-sibling::p[1]');
    await expect(balanceParagraph).toBeVisible({ timeout: 5_000 });

    const balanceBeforeRaw = (await balanceParagraph.textContent())?.trim() ?? '';
    const balanceBefore = parseCzechInt(balanceBeforeRaw);

    await page.goto('/vouchers');
    await expect(
      page.getByRole('heading', { name: 'Vouchery' }),
    ).toBeVisible({ timeout: 10_000 });

    // New full-banner voucher cards do not render the voucher name as visible text
    // in the available tab. The seeded card is still accessible via the banner alt.
    const spec10Card = page
      .locator('.voucher-card-glow')
      .filter({ has: page.locator('img[alt*="E2E Spec10 Voucher"]') })
      .first();

    await expect(
      spec10Card,
      'Expected the seeded E2E Spec10 Voucher full-banner card to be visible in Dostupné tab',
    ).toBeVisible({ timeout: 15_000 });

    const detailButton = spec10Card.getByRole('button', { name: /Detail/i });
    await expect(detailButton).toBeVisible({ timeout: 5_000 });
    await detailButton.click();

    const detailDialog = page.getByRole('dialog').filter({ hasText: 'E2E Spec10 Voucher' });
    await expect(detailDialog, 'Spec10 detail modal must open before purchase').toBeVisible({ timeout: 10_000 });

    const buyButton = detailDialog.getByRole('button', { name: /Koupit za/i });
    await expect(buyButton).toBeVisible({ timeout: 5_000 });

    const buttonText = (await buyButton.textContent()) ?? '';
    const priceMatch = buttonText.match(/Koupit za\s+([\d\s  ]+)\s*(?:MioCoinů|MC)/i);
    if (!priceMatch) {
      throw new Error(`Could not parse voucher price from buy button text: "${buttonText}"`);
    }
    const voucherPrice = parseCzechInt(priceMatch[1]);

    expect(voucherPrice, `Voucher price parsed as ${voucherPrice} — must be > 0`).toBeGreaterThan(0);
    expect(
      balanceBefore,
      `Balance before (${balanceBefore} MC) must exceed voucher price (${voucherPrice} MC). ` +
      `Check the staging wallet reset step — wallet should start at 5 000 MC.`,
    ).toBeGreaterThan(voucherPrice);

    await buyButton.click();

    const successToast = page.locator('[data-sonner-toast]').filter({ hasText: /úspěšně zakoupen/i });
    const errorToast   = page.locator('[data-sonner-toast]').filter({
      hasText: /Nepodařilo se zakoupit|již zakoupen|Nedostatek MioCoin|není dostupný|žádný kód/i,
    });

    await expect(
      successToast.or(errorToast).first(),
      'Expected success or error Sonner toast after voucher purchase click',
    ).toBeVisible({ timeout: 10_000 });

    if (await errorToast.isVisible()) {
      const toastText = (await errorToast.first().textContent()) ?? '(empty)';

      if (/žádný kód/i.test(toastText)) {
        test.skip(
          true,
          `Spec10 voucher was visible but has no seeded voucher_code inventory: "${toastText}"`,
        );
      }

      throw new Error(
        `Voucher purchase returned an error toast on staging: "${toastText}". ` +
        `Balance before: ${balanceBefore} MC, voucher price: ${voucherPrice} MC. ` +
        `Check buy_voucher_atomic RPC logs and staging wallet/voucher state.`,
      );
    }

    await page.goto('/vouchers?tab=purchased');

    const purchasedSpec10Card = page
      .locator('.voucher-card-glow')
      .filter({ has: page.locator('img[alt*="E2E Spec10 Voucher"]') })
      .first();

    await expect(
      purchasedSpec10Card,
      'Purchased Spec10 voucher must appear in Zakoupené tab after successful purchase',
    ).toBeVisible({ timeout: 20_000 });

    await expect(
      purchasedSpec10Card.getByRole('button', { name: 'Zobrazit kód' }),
      'Purchased voucher must expose the new "Zobrazit kód" action',
    ).toBeVisible({ timeout: 5_000 });

    const walletRefreshResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/rest/v1/wallets') &&
        res.request().method() === 'GET',
      { timeout: 15_000 },
    );

    await page.goto(`/contest/${TEST_CONTEST_ID}`);
    await walletRefreshResponse;

    const balanceLabelAfter = page.getByText('Tvůj stav MioCoinů', { exact: true });
    await expect(balanceLabelAfter).toBeVisible({ timeout: 15_000 });
    const balanceParagraphAfter = balanceLabelAfter.locator('xpath=following-sibling::p[1]');

    await expect(balanceParagraphAfter).not.toContainText(balanceBeforeRaw, { timeout: 8_000 });

    const balanceAfterRaw = (await balanceParagraphAfter.textContent())?.trim() ?? '';
    const balanceAfter    = parseCzechInt(balanceAfterRaw);
    const expectedBalance = balanceBefore - voucherPrice;

    expect(
      balanceAfter,
      `Wallet balance should have decreased by exactly ${voucherPrice} MC. ` +
      `Before: ${balanceBefore} MC, After: ${balanceAfter} MC, Expected: ${expectedBalance} MC.`,
    ).toBe(expectedBalance);
  });
});

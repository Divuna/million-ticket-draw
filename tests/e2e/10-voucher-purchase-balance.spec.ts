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
 *
 * What this test verifies:
 *   1. Wallet balance is readable from /contest/:id UI before purchase.
 *   2. An available "E2E Spec10 Voucher" exists in the Dostupné tab.
 *   3. After buying the voucher, a success toast appears.
 *   4. The purchased voucher appears in the Zakoupené tab with "Uplatnit voucher".
 *   5. The balance on /contest/:id decreases by exactly the voucher price.
 *
 * Regressions caught:
 *   - useUserVouchers fetchUserVouchers returning [] (PostgREST join failure).
 *   - buy_voucher_atomic wallet debit stopped working.
 *   - buy_voucher_atomic stopped inserting user_vouchers (redeemed=true).
 *   - Zakoupené tab stopped rendering purchased vouchers.
 *   - ContestDetail stopped refreshing balance on mount (loadUserBalance removed).
 *   - Balance display formatting broken (Czech locale parseInt regression).
 */

import { test, expect } from '@playwright/test';
import { loginViaUI } from './helpers/auth';

const TEST_EMAIL     = process.env.E2E_TEST_EMAIL    ?? '';
const TEST_PASSWORD  = process.env.E2E_TEST_PASSWORD ?? '';
// Provided only by STAGING_E2E_CONTEST_ID secret — absent on production CI.
const TEST_CONTEST_ID = process.env.E2E_CONTEST_ID ?? '';

/**
 * Parse a Czech-locale formatted integer string into a JS number.
 *
 * Czech locale uses a non-breaking space (U+00A0) or regular space as the
 * thousands separator. Examples:
 *   "5 000"  → 5000
 *   "4 995"  → 4995
 *   "5"      → 5
 *
 * Throws if the result is NaN so callers get an actionable failure message.
 */
function parseCzechInt(raw: string): number {
  // Strip all Unicode whitespace / thin-space variants used as thousand separators
  const digits = raw.replace(/[\s   ]+/g, '');
  const n = parseInt(digits, 10);
  if (Number.isNaN(n)) {
    throw new Error(`parseCzechInt: could not parse "${raw}" (after strip: "${digits}")`);
  }
  return n;
}

test.describe('Voucher Purchase — Wallet Balance Decrease', () => {
  test('balance decreases by voucher price after a single voucher purchase', async ({ page }) => {
    // Budget: ~15s login+balance read, ~5s voucher find+buy, ~20s Zakoupené assert,
    // ~15s balance re-check = ~55s minimum. Override the default 30s Playwright timeout.
    test.setTimeout(60_000);

    // ── Guards ────────────────────────────────────────────────────────────────
    if (!TEST_EMAIL || !TEST_PASSWORD) {
      test.skip(true, 'E2E_TEST_EMAIL / E2E_TEST_PASSWORD not set — skipping');
    }
    if (!TEST_CONTEST_ID) {
      test.skip(
        true,
        'E2E_CONTEST_ID not set — staging-only test; production CI intentionally leaves this empty',
      );
    }

    // ── Login ─────────────────────────────────────────────────────────────────
    await loginViaUI(page, TEST_EMAIL, TEST_PASSWORD);

    // ── 1. Read balance before purchase from ContestDetail ────────────────────
    // /vouchers does not display wallet balance. ContestDetail is the reliable
    // UI surface that shows it via loadUserBalance() on mount.
    //
    // Arm the wallet GET interceptor BEFORE navigating so we wait for the fresh
    // DB read before reading the "before" value. Without this guard, the test
    // can read the UI before loadUserBalance() resolves — or capture a value
    // that was settled by a prior spec's async side-effect — producing a stale
    // "before" that doesn't match what the DB actually held at that moment.
    // This mirrors the same waitForResponse pattern used for the "after" read.
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

    // ── 2. Navigate to /vouchers ──────────────────────────────────────────────
    await page.goto('/vouchers');
    await expect(
      page.getByRole('heading', { name: 'Vouchery' }),
    ).toBeVisible({ timeout: 10_000 });

    // ── 3. Find the dedicated spec10 card ─────────────────────────────────────
    // The staging workflow seeds "E2E Spec10 Voucher" with created_at in the past
    // so it appears last in the Dostupné list. Spec 03 uses .first() (newest) and
    // never picks this one. Scoping by name prevents both collision and strict-mode
    // violations when multiple cards exist.
    const spec10Card = page
      .locator('.voucher-card-glow')
      .filter({ hasText: 'E2E Spec10 Voucher' })
      .first();

    const emptyHeading = page.getByRole('heading', { name: 'Žádné dostupné vouchery' });

    // Wait until either the spec10 card OR the empty-state heading appears.
    await expect(async () => {
      const hasSpec10 = (await page
        .locator('.voucher-card-glow')
        .filter({ hasText: 'E2E Spec10 Voucher' })
        .count()) > 0;
      const hasEmpty = await emptyHeading.isVisible();
      if (!hasSpec10 && !hasEmpty) {
        throw new Error('Neither spec10 card nor empty-state visible yet');
      }
    }, 'Expected "E2E Spec10 Voucher" card or empty-state heading to appear').toPass({ timeout: 15_000 });

    if (await emptyHeading.isVisible()) {
      throw new Error(
        'No available vouchers on staging. ' +
        '"E2E Spec10 Voucher" was not found — check the "Seed E2E Spec10 voucher" workflow step.',
      );
    }

    if ((await page
      .locator('.voucher-card-glow')
      .filter({ hasText: 'E2E Spec10 Voucher' })
      .count()) === 0) {
      throw new Error(
        '"E2E Spec10 Voucher" card not found in Dostupné tab. ' +
        'Either the seed step failed or user_vouchers reset did not clear it. ' +
        'Check staging workflow logs.',
      );
    }

    // ── 4. Parse voucher price from buy button label ──────────────────────────
    // Button label: "KOUPIT ZA 5 MC" — scoped to the spec10 card.
    const buyButton = spec10Card.getByRole('button', { name: /KOUPIT ZA/i });
    await expect(buyButton).toBeVisible({ timeout: 5_000 });

    const buttonText = (await buyButton.textContent()) ?? '';
    const priceMatch = buttonText.match(/KOUPIT ZA\s+([\d\s  ]+)\s*MC/i);
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

    // ── 5. Purchase the voucher ───────────────────────────────────────────────
    await buyButton.click();

    // ── 6. Assert success toast ───────────────────────────────────────────────
    // Success:       "Voucher úspěšně zakoupen za X MioCoinů!"
    // Business err:  "Voucher již zakoupen" | "Nedostatek MioCoinů" |
    //                "Voucher není dostupný" | "Nepodařilo se zakoupit voucher"
    // Use /úspěšně zakoupen/i — cannot match the "již zakoupen" error string.
    const successToast = page.locator('[data-sonner-toast]').filter({ hasText: /úspěšně zakoupen/i });
    const errorToast   = page.locator('[data-sonner-toast]').filter({
      hasText: /Nepodařilo se zakoupit|již zakoupen|Nedostatek MioCoin|není dostupný/i,
    });

    await expect(
      successToast.or(errorToast).first(),
      'Expected success or error Sonner toast after voucher purchase click',
    ).toBeVisible({ timeout: 10_000 });

    if (await errorToast.isVisible()) {
      const toastText = (await errorToast.first().textContent()) ?? '(empty)';
      throw new Error(
        `Voucher purchase returned an error toast on staging: "${toastText}". ` +
        `Balance before: ${balanceBefore} MC, voucher price: ${voucherPrice} MC. ` +
        `Check buy_voucher_atomic RPC logs and staging wallet/voucher state.`,
      );
    }

    // ── 7. Verify purchased voucher appears in Zakoupené tab ──────────────────
    // Navigate fresh to /vouchers?tab=purchased (full page reload, not SPA pushState).
    // Reason: handleVoucherPurchase fires toast.success() BEFORE awaiting
    // refetchUserVouchers(). A fresh navigation mounts React from scratch with
    // defaultValue="purchased" active, avoiding any stale-loading-state race.
    // By the time the new page finishes mounting and fires fetchUserVouchers(),
    // the buy_voucher_atomic transaction is already committed.
    await page.goto('/vouchers?tab=purchased');

    const uplatnitButton = page.getByRole('button', { name: 'Uplatnit voucher' }).first();
    await expect(
      uplatnitButton,
      'Purchased voucher must appear in Zakoupené tab with "Uplatnit voucher" button',
    ).toBeVisible({ timeout: 20_000 });

    // ── 8. Navigate to ContestDetail to verify balance decreased ─────────────
    // Arm the wallets GET interceptor before navigating so we wait for the fresh
    // DB read before asserting the balance value.
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

    // Poll until the UI reflects the post-purchase value.
    await expect(balanceParagraphAfter).not.toContainText(balanceBeforeRaw, { timeout: 8_000 });

    // ── 9. Assert exact balance decrease ──────────────────────────────────────
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
